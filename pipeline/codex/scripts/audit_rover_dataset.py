from pathlib import Path
import json,numpy as np
from PIL import Image

def audit(root):
 root=Path(root);m=json.loads((root/'transforms.json').read_text());splits=[set(m[k+'_filenames']) for k in ['train','val','test']];assert all(splits);assert not(splits[0]&splits[1] or splits[0]&splits[2] or splits[1]&splits[2]);names=set()
 for f in m['frames']:
  assert f['file_path'] not in names;names.add(f['file_path']);t=np.array(f['transform_matrix']);assert np.allclose(t[:3,:3].T@t[:3,:3],np.eye(3),atol=1e-4) and abs(np.linalg.det(t[:3,:3])-1)<1e-4
  with Image.open(root/f['file_path']) as im:assert im.size==(f['w'],f['h'])
  with Image.open(root/f['mask_path']) as im:assert im.size==(f['w'],f['h'])
 assert set.union(*splits)==names;return {'passed':True,'frames':len(names),'scope':'site-frame measured rover geometry; no orbital tie'}
