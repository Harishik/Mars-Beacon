import os
"""Quality-screen REMS pressure and fit a blocked-sol empirical tidal model."""
from pathlib import Path
import numpy as np,pandas as pd,json,hashlib,xml.etree.ElementTree as E
ROOT=Path(os.environ.get('MARS_BEACON_DATA','Mars_BEACON_Datasets')+'/06_Atmosphere_And_Space_Weather/REMS');OUT=Path(__file__).resolve().parents[1]/'data/observed_atmosphere';OUT.mkdir(exist_ok=True)
ns={'p':'http://pds.nasa.gov/pds4/pds/v1'};rows=[];sources=[];rejects={'pressure':0,'brightness':0};count=0
files=sorted((ROOT/'campaign').rglob('*.TAB'))
for fi,p in enumerate(files):
 label=p.with_suffix('.xml');r=E.parse(label);fields=r.findall('.//p:Field_Character',ns);schema={x.findtext('p:name',namespaces=ns):(int(x.findtext('p:field_number',namespaces=ns))-1,int(x.findtext('p:field_location',namespaces=ns))-1,int(x.findtext('p:field_length',namespaces=ns))) for x in fields}
 required=['LTST','BRIGHTNESS_TEMP_A','GTS_CONFIDENCE_LEVEL','BAROCAP_PRESSURE_1','BAROCAP_PRESSURE_2','PS_CONFIDENCE_LEVEL'];assert all(k in schema for k in required)
 # Read fields at label-declared byte offsets, never infer whitespace-delimited columns.
 specs=[(schema[k][1],schema[k][1]+schema[k][2]) for k in required]
 d=pd.read_fwf(p,colspecs=specs,names=required,dtype=str,keep_default_na=False);count+=len(d)
 time=d.LTST.str.strip(' "');sol=pd.to_numeric(time.str.slice(0,5),errors='coerce').to_numpy();hh=pd.to_numeric(time.str.slice(6,8),errors='coerce').to_numpy();mm=pd.to_numeric(time.str.slice(9,11),errors='coerce').to_numpy();ss=pd.to_numeric(time.str.slice(12,14),errors='coerce').to_numpy();hour=hh+mm/60+ss/3600
 flags=d.PS_CONFIDENCE_LEVEL.str.strip(' "');p1=pd.to_numeric(d.BAROCAP_PRESSURE_1,errors='coerce').to_numpy();p2=pd.to_numeric(d.BAROCAP_PRESSURE_2,errors='coerce').to_numpy();use2=(p2>0)&np.isfinite(p2);press=np.where(use2,p2,p1)
 # Bit 0 identifies oscillator, not quality. Require no warm-up and no shadow effect.
 good=flags.str.fullmatch('[01]11').to_numpy()&(press>0)&np.isfinite(press)&np.isfinite(hour)&(hour>=0)&(hour<24)
 rejects['pressure']+=int((~good).sum());brightness=pd.to_numeric(d.BRIGHTNESS_TEMP_A,errors='coerce').to_numpy();gts=d.GTS_CONFIDENCE_LEVEL.str.strip(' "').eq('111111').to_numpy()&(brightness>0)&np.isfinite(brightness);rejects['brightness']+=int((~gts).sum())
 for soln in np.unique(sol[np.isfinite(sol)]):
  for b in range(48):
   mask=(sol==soln)&(np.floor(hour*2)==b);valid=mask&good;gv=mask&gts
   if valid.any() or gv.any():rows.append({'sol':int(soln),'ltst_hour_center':(b+.5)/2,'pressure_pa':float(np.mean(press[valid])) if valid.any() else None,'pressure_n':int(valid.sum()),'gts_brightness_A_k':float(np.mean(brightness[gv])) if gv.any() else None,'gts_n':int(gv.sum())})
 sources.append({'file':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'label_sha256':hashlib.sha256(label.read_bytes()).hexdigest(),'rows':len(d)})
 if fi%25==0:print('READ',fi,'/',len(files),flush=True)
d=pd.DataFrame(rows)
# A UTC-based source product can straddle an LTST sol/bin boundary. Merge sufficient
# statistics across files rather than dropping the second partial bin.
d['p_sum']=d.pressure_pa.fillna(0)*d.pressure_n;d['t_sum']=d.gts_brightness_A_k.fillna(0)*d.gts_n
d=d.groupby(['sol','ltst_hour_center'],as_index=False)[['p_sum','pressure_n','t_sum','gts_n']].sum()
d['pressure_pa']=d.p_sum/d.pressure_n.replace(0,np.nan);d['gts_brightness_A_k']=d.t_sum/d.gts_n.replace(0,np.nan)
assert not d.duplicated(['sol','ltst_hour_center']).any();d.to_csv(OUT/'rems_halfhour_observations.csv',index=False)
pressure=d[d.pressure_n>0];sols=np.sort(pressure.sol.unique());i=int(len(sols)*.6);j=int(len(sols)*.8);train=pressure[pressure.sol.isin(sols[:i])];val=pressure[pressure.sol.isin(sols[i:j])];test=pressure[pressure.sol.isin(sols[j:])];center=float(train.sol.mean());scale=float(train.sol.std())
def X(d,k):
 t=2*np.pi*d.ltst_hour_center.to_numpy()/24;s=(d.sol.to_numpy()-center)/scale
 return np.stack([np.ones(len(d)),s]+[f(n*t) for n in range(1,k+1) for f in [np.sin,np.cos]],1)
def metrics(d,p):
 # Mean absolute error over all bins and mean of per-sol MAEs.
 e=abs(d.pressure_pa.to_numpy()-p);return {'mae_pa':float(e.mean()),'rmse_pa':float(np.sqrt(np.mean((d.pressure_pa.to_numpy()-p)**2))),'mean_per_sol_mae_pa':float(pd.Series(e).groupby(d.sol.to_numpy()).mean().mean())}
candidates=[]
for k in [1,2,3,4]:
 coef=np.linalg.lstsq(X(train,k),train.pressure_pa,rcond=None)[0];candidates.append((metrics(val,X(val,k)@coef)['mean_per_sol_mae_pa'],k,coef))
_,k,coef=min(candidates,key=lambda q:q[0]);pred=X(test,k)@coef;constant=float(train.pressure_pa.median());vm=metrics(val,X(val,k)@coef);tm=metrics(test,pred);bm=metrics(test,np.full(len(test),constant));p90=float(np.quantile(abs(val.pressure_pa-(X(val,k)@coef)),.9));band=float(np.mean(abs(test.pressure_pa-pred)<=p90))
report={'status':'empirical rover-local pressure model; not a spatial atmospheric solution','source_files':len(files),'source_rows':count,'rejected_samples':rejects,'half_hour_rows':len(d),'retained_pressure_bins':len(pressure),'strict_GTS_brightness_bins':int((d.gts_n>0).sum()),'train_sols':[int(sols[0]),int(sols[i-1])],'validation_sols':[int(sols[i]),int(sols[j-1])],'test_sols':[int(sols[j]),int(sols[-1])],'harmonics':k,'coef':coef.tolist(),'sol_center':center,'sol_scale':scale,'validation':vm,'test':tm,'constant_test':bm,'validation_absolute_error_band_pa':p90,'test_band_coverage':band,'beats_constant':tm['mean_per_sol_mae_pa']<bm['mean_per_sol_mae_pa'],'limitations':['Whole later sols held out; extrapolation can degrade','Rover moves across elevations; trend mixes meteorology and route','GTS brightness temperature is not kinetic surface temperature','Pressure quality: label bits 1 and 2 must be good; -999 and unknown values excluded','No radiation dose, wind field or spatial dust inference from these readings']}
(OUT/'rems_pressure_model.json').write_text(json.dumps(report,indent=2));(OUT/'rems_sources.json').write_text(json.dumps(sources,indent=2));test.assign(predicted_pressure_pa=pred).to_csv(OUT/'rems_pressure_test.csv',index=False);print(json.dumps(report,indent=2))
