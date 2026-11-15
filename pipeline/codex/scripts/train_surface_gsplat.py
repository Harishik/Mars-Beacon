"""Bounded static orbital distillation preview. No claim of inferred fine geometry."""
import argparse,json,time,random,hashlib,subprocess,sys
from pathlib import Path
import numpy as np
from PIL import Image
import torch
from torch import nn
from gsplat import rasterization
from gsplat.strategy import DefaultStrategy
from plyfile import PlyData,PlyElement
from skimage.metrics import structural_similarity
from audit_dataset import audit

def export_ply(p,path):
 vals={k:v.detach().cpu().numpy() for k,v in p.items()};n=len(vals['means']);dtype=[(k,'f4') for k in ['x','y','z','nx','ny','nz','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3']];arr=np.zeros(n,dtype=dtype)
 for j,k in enumerate(['x','y','z']):arr[k]=vals['means'][:,j]
 for j in range(3):arr[f'f_dc_{j}']=vals['sh0'][:,0,j];arr[f'scale_{j}']=vals['scales'][:,j]
 arr['opacity']=vals['opacities']
 q=vals['quats'];q/=np.linalg.norm(q,axis=1,keepdims=True)
 for j in range(4):arr[f'rot_{j}']=q[:,j]
 PlyData([PlyElement.describe(arr,'vertex')],text=False).write(str(path))

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--data',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);ap.add_argument('--steps',type=int,default=5000);ap.add_argument('--resume',type=Path);ap.add_argument('--anchor-dem',action='store_true');a=ap.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 audit(a.data);assert torch.cuda.is_available();torch.manual_seed(42);np.random.seed(42);random.seed(42);torch.set_num_threads(2)
 m=json.loads((a.data/'transforms.json').read_text());seed=np.load(a.data/'seeds.npz');dev='cuda';n=len(seed['points']);C0=.28209479177387814
 p=nn.ParameterDict({'means':nn.Parameter(torch.tensor(seed['points'],dtype=torch.float32,device=dev)), 'scales':nn.Parameter(torch.full((n,3),np.log(1.4),device=dev)), 'quats':nn.Parameter(torch.tensor([[1.,0,0,0]],device=dev).repeat(n,1)), 'opacities':nn.Parameter(torch.full((n,),torch.logit(torch.tensor(.5)).item(),device=dev)), 'sh0':nn.Parameter(((torch.tensor(seed['colors'],dtype=torch.float32,device=dev)/255-.5)/C0)[:,None,:])})
 rates={'means':.016,'scales':.005,'quats':.001,'opacities':.05,'sh0':.0025};opts={k:torch.optim.Adam([v],lr=rates[k],eps=1e-15) for k,v in p.items()}
 strategy=DefaultStrategy(refine_stop_iter=min(3500,a.steps-1),verbose=False);strategy.check_sanity(p,opts);state=strategy.initialize_state(scene_scale=150.)
 # Surface-constrained variant: project centres to bilinear measured DEM after updates.
 terrain=np.load(a.data/'terrain.npz');vv=terrain['vertices'].reshape(*terrain['shape'],3)
 zgrid=torch.tensor(vv[:,:,2].copy(),dtype=torch.float32,device=dev)[None,None]
 xmin,xmax=float(vv[:,:,0].min()),float(vv[:,:,0].max());ymin,ymax=float(vv[:,:,1].min()),float(vv[:,:,1].max())
 @torch.no_grad()
 def project_surface():
  if not a.anchor_dem:return
  xyz=p['means'];xyz[:,0].clamp_(xmin,xmax);xyz[:,1].clamp_(ymin,ymax)
  grid=torch.stack([2*(xyz[:,0]-xmin)/(xmax-xmin)-1,1-2*(xyz[:,1]-ymin)/(ymax-ymin)],-1)[None,None]
  xyz[:,2]=torch.nn.functional.grid_sample(zgrid,grid,mode='bilinear',align_corners=True).reshape(-1)
 start=0
 if a.resume:
  ck=torch.load(a.resume,map_location=dev,weights_only=False)
  for k,v in ck['params'].items():p[k]=nn.Parameter(v)
  opts={k:torch.optim.Adam([v],lr=rates[k],eps=1e-15) for k,v in p.items()}
  for k,o in opts.items():o.load_state_dict(ck['optimizers'][k])
  state=ck['strategy'];start=ck['step']
 K=torch.tensor([[[m['fl_x'],0,m['cx']],[0,m['fl_y'],m['cy']],[0,0,1]]],device=dev);frames={f['file_path']:f for f in m['frames']};cache={}
 for name,f in frames.items():
  c=torch.tensor(f['transform_matrix'],dtype=torch.float32,device=dev);c[:3,1:3]*=-1 # OpenGL c2w -> OpenCV c2w
  cache[name]=(torch.linalg.inv(c)[None],torch.tensor(np.array(Image.open(a.data/name).convert('RGB')),device=dev,dtype=torch.float32)[None]/255)
 def render(name):
  vm,gt=cache[name]
  rgb,alpha,info=rasterization(means=p['means'],quats=p['quats'],scales=p['scales'].exp(),opacities=p['opacities'].sigmoid(),colors=p['sh0'],sh_degree=0,viewmats=vm,Ks=K,width=m['w'],height=m['h'],packed=False,near_plane=.1,far_plane=2000.)
  return rgb,gt,info
 def save(step):
  torch.save({'params':p.state_dict(),'optimizers':{k:o.state_dict() for k,o in opts.items()},'strategy':state,'step':step,'seed':42},a.out/f'checkpoint_{step:06d}.pt');export_ply(p,a.out/f'point_cloud_{step:06d}.ply')
 def evaluate(step):
  metrics=[]
  with torch.no_grad():
   for i,name in enumerate(m['val_filenames']):
    pred,gt,_=render(name);pred=pred.clamp(0,1);mse=(pred-gt).square().mean();x=pred[0].cpu().numpy();y=gt[0].cpu().numpy();metrics.append({'frame':name,'psnr':float(-10*torch.log10(mse)),'ssim':float(structural_similarity(x,y,channel_axis=2,data_range=1.))})
    if i<3:Image.fromarray((np.concatenate([y,x],axis=1)*255).astype(np.uint8)).save(a.out/f'val_{step:06d}_{i}.png')
  result={'step':step,'gaussians':len(p['means']),'mean_psnr':float(np.mean([x['psnr'] for x in metrics])),'mean_ssim':float(np.mean([x['ssim'] for x in metrics])),'lpips':None,'scope':'held-out synthetic orbital renders; not real rover images','frames':metrics};(a.out/f'validation_{step:06d}.json').write_text(json.dumps(result,indent=2));print('VALIDATION',json.dumps(result),flush=True)
 env={'torch':torch.__version__,'cuda':torch.version.cuda,'gpu':torch.cuda.get_device_name(0),'steps':a.steps,'seed':42,'method':'gsplat 1.5.3, SH0 fixed-exposure orbital distillation','anchor_dem':a.anchor_dem,'started_unix':time.time()};(a.out/'run.json').write_text(json.dumps(env,indent=2));(a.out/'pip-freeze.txt').write_text(subprocess.check_output([sys.executable,'-m','pip','freeze'],text=True))
 project_surface();evaluate(start);t=time.time()
 with (a.out/'train.jsonl').open('a') as log:
  for step in range(start,a.steps):
   name=random.choice(m['train_filenames']);pred,gt,info=render(name);strategy.step_pre_backward(p,opts,state,step,info);loss=(pred-gt).abs().mean();assert torch.isfinite(loss),'Nonfinite loss';loss.backward()
   for opt in opts.values():opt.step();opt.zero_grad(set_to_none=True)
   # Memory guard: stop densifying at 250k. This is a preview budget, not a quality claim.
   if len(p['means'])<250000:strategy.step_post_backward(p,opts,state,step,info,packed=False)
   project_surface()
   if (step+1)%100==0:
    row={'step':step+1,'l1':float(loss.detach()),'gaussians':len(p['means']),'seconds':time.time()-t};log.write(json.dumps(row)+'\n');log.flush();print(json.dumps(row),flush=True)
   if (step+1)%1000==0 or step+1==a.steps:save(step+1);evaluate(step+1)
 print('PREVIEW_COMPLETE; inspect held-out renders and geometry before full training or temporal layers',flush=True)
if __name__=='__main__':main()
