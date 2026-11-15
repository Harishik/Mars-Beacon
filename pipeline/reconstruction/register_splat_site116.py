"""Register the Codex Altadena splat (site 116 ENU) to the Gale 4 m HiRISE grid.
Usage: python register_splat_site116.py <Mars_BEACON_Rover_Final extracted folder> <gale bundle folder>"""
import json, math, sys, numpy as np
C=sys.argv[1]; B=sys.argv[2]
raw=open(C+'/exports/altadena/cleaned.ply','rb').read(); h=raw.index(b'end_header\n')+11
v=np.frombuffer(raw[h:],dtype='<f4').reshape(-1,17)
xyz=v[:,:3].astype(float); op=1/(1+np.exp(-v[:,9]))
t=json.load(open(C+'/data/altadena_rover/transforms.json')); o=np.array(t['site_origin_enu_m'])
m=json.load(open(B+'/manifest.json')); R=3396190.0
lat0,lon0=m['crs']['origin']['lat'],m['crs']['origin']['lon']; kx=math.cos(math.radians(lat0))
cx,cy=R*math.radians(lon0),R*math.radians(lat0)
E0,N0,Z0=8143539.442,-284377.334,-3657.810   # PDS PLACES SITE 116 origin
g=m['grid']; H=np.fromfile(B+'/height_4m.f32','<f4').reshape(g['rows'],g['cols']); Ext=g['extentM']; cell=g['liveM']
def dem(x,y):
    fc=np.clip((x+Ext/2)/cell-0.5,0,g['cols']-1.001); fr=np.clip((Ext/2-y)/cell-0.5,0,g['rows']-1.001)
    c=np.floor(fc).astype(int); r=np.floor(fr).astype(int); tx=fc-c; ty=fr-r
    return (H[r,c]*(1-tx)+H[r,c+1]*tx)*(1-ty)+(H[r+1,c]*(1-tx)+H[r+1,c+1]*tx)*ty
keep=op>0.5
p=xyz[keep]+o   # site 116 ENU
X=(E0+p[:,0]-cx)*kx; Y=(N0+p[:,1]-cy); Z=Z0+p[:,2]
# Ground points within 20 m of the rover origin cluster centre, binned to 2 m medians
cen=np.median(np.c_[X,Y],0)
sel=np.hypot(X-cen[0],Y-cen[1])<25; X,Y,Z=X[sel],Y[sel],Z[sel]
bx=np.round(X/2); by=np.round(Y/2); keys=bx*100000+by
order=np.argsort(keys); ks,idx=np.unique(keys[order],return_index=True)
med=np.array([np.median(Z[order][a:b]) for a,b in zip(idx,list(idx[1:])+[len(order)])])
gx=np.array([X[order][a] for a in idx]); gy=np.array([Y[order][a] for a in idx])
gx=np.round(gx/2)*2; gy=np.round(gy/2)*2
best=None
for dx in np.arange(-30,30.01,0.5):
  for dy in np.arange(-30,30.01,0.5):
    d=med-dem(gx+dx,gy+dy); off=np.median(d); r=np.sqrt(np.mean((d-off)**2))
    if best is None or r<best[0]: best=(r,dx,dy,off)
d0=med-dem(gx,gy); r0=np.sqrt(np.mean((d0-np.median(d0))**2))
print('bins',len(med),'centre',cen.round(1),'rmse0',round(r0,3),'best',[round(float(x),3) for x in best])
json.dump({'site':116,'frame':'site 116 ENU (Codex transforms.json, site_origin_enu_m added back)','placesSiteOrigin':{'easting':E0,'northing':N0,'elevation':Z0},
 'dx':float(best[1]),'dy':float(best[2]),'verticalOffsetM':float(-best[3]),'rmseM':float(best[0]),'rmse0M':float(r0),'bins2m':int(len(med)),
 'method':'grid search of horizontal shift minimising RMSE between 2 m median splat-centre heights (opacity > 0.5) and the 4 m HiRISE grid, after removing the median vertical offset'},open('registration_site116_splat.json','w'),indent=1)
