import os
"""Fit wavelength-specific seasonal climatology with chronological held-out sols."""
from pathlib import Path
import csv,json,hashlib
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(os.environ.get('MARS_BEACON_DATA','Mars_BEACON_Datasets')+'/06_Atmosphere_And_Space_Weather/Opacity/data_derived');OUT=Path(__file__).resolve().parents[1]/'data/observed_atmosphere';OUT.mkdir(exist_ok=True)
def design(ls,k):
 x=np.deg2rad(ls);return np.stack([np.ones_like(x)]+[f(i*x) for i in range(1,k+1) for f in [np.sin,np.cos]],1)
def metrics(y,p):return {'mae_tau':float(np.mean(abs(y-p))),'rmse_tau':float(np.sqrt(np.mean((y-p)**2))),'bias_tau':float(np.mean(p-y))}
reports=[];fig,axes=plt.subplots(2,1,figsize=(12,7),constrained_layout=True)
for wave,ax in zip([440,880],axes):
 src=ROOT/f'msl_tau_{wave}.csv';raw=list(csv.reader(src.open()));rows=[];reject=0
 for r in raw:
  sol,ls,tau,sigma=map(float,r[1:]);valid=np.isfinite([sol,ls,tau,sigma]).all() and tau>0 and sigma>0 and 0<=ls<=360
  if valid:rows.append((sol,ls,tau,sigma,r[0]))
  else:reject+=1
 rows.sort();sols=np.unique([int(x[0]) for x in rows]);day=[]
 for sol in sols:
  group=[x for x in rows if int(x[0])==sol];a=np.array([x[:4] for x in group]);w=1/np.maximum(a[:,3],.01)**2
  # Circular mean prevents a season-wrap average near 180 degrees.
  ang=np.arctan2(np.sum(w*np.sin(np.deg2rad(a[:,1]))),np.sum(w*np.cos(np.deg2rad(a[:,1]))))
  day.append([sol,np.rad2deg(ang)%360,np.sum(w*a[:,2])/w.sum(),np.sqrt(1/w.sum()),len(group)])
 d=np.array(day);n=len(d);i=int(n*.6);j=int(n*.8);tr=d[:i];va=d[i:j];te=d[j:];candidates=[]
 for k in [1,2,3,4,6]:
  for ridge in [.01,1.,10.]:
   X=design(tr[:,1],k);weights=1/np.maximum(tr[:,3],.03)**2;reg=np.eye(X.shape[1])*ridge;reg[0,0]=0
   coef=np.linalg.solve(X.T@(weights[:,None]*X)+reg,X.T@(weights*np.log(tr[:,2])))
   pred=np.exp(design(va[:,1],k)@coef);score=metrics(va[:,2],pred)['mae_tau'];candidates.append((score,k,ridge,coef))
 score,k,ridge,coef=min(candidates,key=lambda x:x[0]);vp=np.exp(design(va[:,1],k)@coef);tp=np.exp(design(te[:,1],k)@coef);constant=float(np.median(tr[:,2]));q=float(np.quantile(abs(va[:,2]-vp),.9));base=metrics(te[:,2],np.full(len(te),constant));test=metrics(te[:,2],tp)
 # Compare train-only circular 20-degree seasonal median baseline.
 bins=np.floor(tr[:,1]/20).astype(int);clim=np.array([np.median(tr[bins==b,2]) if np.any(bins==b) else constant for b in range(18)]);climp=clim[np.floor(te[:,1]/20).astype(int)%18]
 split=lambda x:{'sol_min':int(x[0,0]),'sol_max':int(x[-1,0]),'n_sols':len(x)}
 report={'wavelength_nm':wave,'source_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'input_rows':len(raw),'rejected':reject,'daily_rows':n,'splits':dict(train=split(tr),validation=split(va),test=split(te)),'model':{'kind':'log-tau periodic harmonic ridge','harmonics':k,'ridge':ridge,'coefficients':coef.tolist()},'test':test,'constant_test':base,'seasonal_bin_test':metrics(te[:,2],climp),'validation_calibrated_absolute_band_tau':q,'test_band_coverage':float(np.mean(abs(te[:,2]-tp)<=q)),'beats_both_baselines':test['mae_tau']<min(base['mae_tau'],metrics(te[:,2],climp)['mae_tau']),'scientific_scope':'Gale rover column optical depth at stated wavelength. Climatology is not a storm forecast or spatial map. Band is empirical, not guaranteed under temporal shift.','campaign_4534_4811_overlap':bool(np.any((d[:,0]>=4534)&(d[:,0]<=4811)))}
 reports.append(report)
 with (OUT/f'tau_{wave}_daily.csv').open('w') as f:
  w=csv.writer(f);w.writerow(['sol_integer','ls_deg','tau','sigma_combined','n_observations','split']);w.writerows([list(row)+['train' if t<i else 'validation' if t<j else 'test'] for t,row in enumerate(d)])
 with (OUT/f'tau_{wave}_test_predictions.csv').open('w') as f:
  w=csv.writer(f);w.writerow(['sol','ls','observed_tau','predicted_tau','lower90_empirical','upper90_empirical']);w.writerows(zip(te[:,0],te[:,1],te[:,2],tp,np.maximum(0,tp-q),tp+q))
 (OUT/f'tau_{wave}_model.json').write_text(json.dumps(report,indent=2));ax.plot(d[:,0],d[:,2],'.',ms=2,label='Measured daily opacity');ax.plot(te[:,0],tp,lw=1,label='Held-out climatology');ax.axvline(va[0,0],c='orange',ls='--');ax.axvline(te[0,0],c='red',ls='--');ax.set(ylabel=f'Tau at {wave} nm',xlabel='Mission sol',yscale='log');ax.legend()
(OUT/'validation.json').write_text(json.dumps(reports,indent=2));fig.savefig(OUT/'opacity_validation.png',dpi=140);print(json.dumps(reports,indent=2))
