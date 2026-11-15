"""Preserve raw PLY, filter explicit bounds/opacity, export SH0 .splat (32 bytes/splat)."""
import argparse,json,hashlib
from pathlib import Path
import numpy as np
from plyfile import PlyData,PlyElement
p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('out',type=Path);p.add_argument('--bounds',type=float,nargs=6,required=True,metavar=('XMIN','YMIN','ZMIN','XMAX','YMAX','ZMAX'));p.add_argument('--min-opacity',type=float,default=.01);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
v=PlyData.read(str(a.input))['vertex'].data;pos=np.stack([v[k] for k in ['x','y','z']],1);opa=1/(1+np.exp(-np.clip(v['opacity'],-80,80)));lo=np.array(a.bounds[:3]);hi=np.array(a.bounds[3:]);assert (hi>lo).all()
keep=np.isfinite(pos).all(1)&(pos>=lo).all(1)&(pos<=hi).all(1)&(opa>=a.min_opacity);v=v[keep];assert len(v)>0
PlyData([PlyElement.describe(v,'vertex')],text=False).write(str(a.out/'cleaned.ply'))
positions=np.stack([v[k] for k in ['x','y','z']],1);scales=np.exp(np.stack([v[f'scale_{i}'] for i in range(3)],1));rgb=np.clip(.5+.28209479177387814*np.stack([v[f'f_dc_{i}'] for i in range(3)],1),0,1);op=1/(1+np.exp(-np.clip(v['opacity'],-80,80)));q=np.stack([v[f'rot_{i}'] for i in range(4)],1);q/=np.linalg.norm(q,axis=1,keepdims=True)
assert np.isfinite(scales).all() and np.isfinite(q).all()
out=np.zeros(len(v),dtype=[('pos','<f4',(3,)),('scale','<f4',(3,)),('rgba','u1',(4,)),('quat','u1',(4,))]);out['pos']=positions;out['scale']=scales;out['rgba']=np.clip(np.concatenate([rgb,op[:,None]],1)*255,0,255).astype('u1');out['quat']=np.clip(q*128+128,0,255).astype('u1');out.tofile(a.out/'terrain.splat')
report={'raw_sha256':hashlib.sha256(a.input.read_bytes()).hexdigest(),'input_count':len(keep),'output_count':int(keep.sum()),'bounds':a.bounds,'min_opacity':a.min_opacity,'splat_bytes':(a.out/'terrain.splat').stat().st_size,'format':'standard SH0 SPLAT; not SPZ','browser_load_seconds':None,'browser_fps':None,'raw_preserved':str(a.input)};(a.out/'compression.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
