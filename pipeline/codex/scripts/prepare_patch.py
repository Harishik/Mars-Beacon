"""Crop real Gale rasters into a metre-coordinate, source-traceable preview patch."""
import argparse, json, hashlib
from pathlib import Path
import numpy as np
import rasterio
from rasterio.windows import Window
from rasterio.warp import reproject, Resampling
from PIL import Image
p=argparse.ArgumentParser(); p.add_argument('--root',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
dem=a.root/'gale_dem_campaign_4km.tif'; ortho=a.root/'gale_ortho_campaign_4km.tif'
with rasterio.open(dem) as d:
 # 256 m engineering preview at crop centre; not a verified mission waypoint.
 win=Window(d.width//2-128,d.height//2-128,256,256)
 h=d.read(1,window=win,masked=True)
 assert not np.ma.getmaskarray(h).any(), 'DEM no-data in preview'
 tr=d.window_transform(win); crs=d.crs
 h=np.asarray(h,dtype=np.float32); z0=float(np.median(h)); h-=z0
 tex=np.zeros((256,256),np.uint8)
 with rasterio.open(ortho) as s:
  reproject(rasterio.band(s,1),tex,src_transform=s.transform,src_crs=s.crs,dst_transform=tr,dst_crs=crs,resampling=Resampling.bilinear)
 assert np.count_nonzero(tex)/tex.size>.99, 'Missing orthophoto coverage'
 x=(np.arange(256)+.5)*tr.a; x-=x.mean(); y=(np.arange(256)+.5)*tr.e;y-=y.mean()
 xx,yy=np.meshgrid(x,y); vertices=np.stack([xx,yy,h],-1).reshape(-1,3)
 np.savez(a.out/'terrain.npz',vertices=vertices,shape=h.shape)
 Image.fromarray(tex).convert('RGB').save(a.out/'texture.png')
 # Downsample seeds at 2 m; same coordinate frame as mesh and cameras.
 seeds=np.stack([xx[::2,::2],yy[::2,::2],h[::2,::2]],-1).reshape(-1,3)
 colors=np.repeat(tex[::2,::2].reshape(-1,1),3,axis=1)
 np.savez(a.out/'seeds.npz',points=seeds,colors=colors)
 with (a.out/'seed.ply').open('w') as f:
  f.write('ply\nformat ascii 1.0\nelement vertex %d\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n'%len(seeds))
  for pt,c in zip(seeds,colors): f.write(' '.join(map(str,[*pt,*c]))+'\n')
 def sha(p):
  h=hashlib.sha256()
  with p.open('rb') as f:
   for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
  return h.hexdigest()
 meta={'kind':'synthetic_views_of_measured_orbital_terrain','site':'Gale crop-centre engineering preview; waypoint unverified','units':'metres','axes':'X east, Y north, Z up','origin_projected':[tr.c+128*tr.a,tr.f+128*tr.e,z0],'crs':crs.to_wkt(),'dem_resolution_m':1,'texture':'USGS greyscale ortho resampled to 1m; no inferred colour','sources':[{'path':str(q),'sha256':sha(q)} for q in (dem,ortho)],'elevation_range_local_m':[float(h.min()),float(h.max())],'registration':'shared CRS resampling; visual co-registration still requires review'}
 (a.out/'provenance.json').write_text(json.dumps(meta,indent=2)); print(json.dumps(meta,indent=2))
