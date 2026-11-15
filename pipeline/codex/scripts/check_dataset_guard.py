"""Adversarial camera/split checks using the real rendered dataset."""
from pathlib import Path
import tempfile, json, copy, sys
from audit_dataset import audit
root=Path(sys.argv[1]).resolve();base=json.loads((root/'transforms.json').read_text());out={}
for case in ['inverted_camera','overlapping_split','missing_image']:
 with tempfile.TemporaryDirectory() as tmp:
  q=Path(tmp);(q/'images').symlink_to(root/'images');m=copy.deepcopy(base)
  if case=='inverted_camera':
   for row in m['frames'][0]['transform_matrix'][:3]:row[1]*=-1;row[2]*=-1
  if case=='overlapping_split':m['val_filenames'].append(m['train_filenames'][0])
  if case=='missing_image':m['frames'][0]['file_path']='images/absent.png'
  (q/'transforms.json').write_text(json.dumps(m))
  try:audit(q);out[case]=False
  except (AssertionError,FileNotFoundError):out[case]=True
assert all(out.values()),out
print(json.dumps({'negative_cases_rejected':out},indent=2))
