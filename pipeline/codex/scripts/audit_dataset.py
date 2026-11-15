import json, argparse, hashlib
from pathlib import Path
import numpy as np
from PIL import Image

def audit(root):
 root=Path(root);m=json.loads((root/'transforms.json').read_text());seen=set();errors=[];dots=[]
 for f in m['frames']:
  name=f['file_path'];assert name not in seen;seen.add(name)
  with Image.open(root/name) as im: assert im.size==(m['w'],m['h'])
  t=np.array(f['transform_matrix']);r=t[:3,:3];pos=t[:3,3]
  assert np.allclose(t[3],[0,0,0,1]) and np.allclose(r.T@r,np.eye(3),atol=1e-5) and abs(np.linalg.det(r)-1)<1e-5
  dot=float(np.dot(-r[:,2],-pos/np.linalg.norm(pos)));dots.append(dot);assert dot>.999
  p=r.T@(-pos);uv=[m['fl_x']*p[0]/-p[2]+m['cx'],m['cy']-m['fl_y']*p[1]/-p[2]];errors.append(float(np.linalg.norm(np.array(uv)-[m['cx'],m['cy']]))); assert p[2]<0
 splits=[set(m[x+'_filenames']) for x in ['train','val','test']]
 assert all(splits) and not(splits[0]&splits[1] or splits[0]&splits[2] or splits[1]&splits[2]) and set.union(*splits)==seen
 assert max(errors)<.001
 report={'passed':True,'views':len(seen),'splits':dict(zip(['train','val','test'],map(len,splits))),'minimum_inward_dot':min(dots),'maximum_target_projection_error_pixels':max(errors),'scope':'calibration and split mechanics; not independent Mars reconstruction validation'}
 (root/'audit.json').write_text(json.dumps(report,indent=2));return report
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');a=p.parse_args();print(json.dumps(audit(a.root),indent=2))
