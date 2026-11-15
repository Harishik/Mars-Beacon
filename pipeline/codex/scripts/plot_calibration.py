from pathlib import Path
import json,sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image
root=Path(sys.argv[1]);out=Path(sys.argv[2]);m=json.loads((root/'transforms.json').read_text());pts=np.load(root/'seeds.npz')['points'];fig=plt.figure(figsize=(12,6));ax=fig.add_subplot(121,projection='3d');ax.scatter(*pts[::16].T,s=.4,c=pts[::16,2],cmap='terrain')
for f in m['frames']:
 t=np.array(f['transform_matrix']);p=t[:3,3];v=-t[:3,2]*25;color='tab:blue' if f['file_path'] in m['train_filenames'] else 'tab:orange';ax.quiver(*p,*v,color=color,linewidth=.5)
ax.set(xlabel='East (m)',ylabel='North (m)',zlabel='Height relative to origin (m)',title='120 inward-facing OpenGL cameras\nBlue: train; orange: held out');ax.set_box_aspect((1,1,.7))
f=m['frames'][0];t=np.array(f['transform_matrix']);pc=(pts-t[:3,3])@t[:3,:3];u=m['fl_x']*pc[:,0]/-pc[:,2]+m['cx'];v=m['cy']-m['fl_y']*pc[:,1]/-pc[:,2];valid=(pc[:,2]<0)&(u>=0)&(u<m['w'])&(v>=0)&(v<m['h']);idx=np.flatnonzero(valid)[::20];ax=fig.add_subplot(122);ax.imshow(Image.open(root/f['file_path']));ax.scatter(u[idx],v[idx],s=2,c='cyan',alpha=.6);ax.set_title('DEM seed reprojections on Blender image\nExact camera extrinsics + intrinsics');ax.axis('off');fig.tight_layout();fig.savefig(out/'camera_calibration.png',dpi=160,bbox_inches='tight')
