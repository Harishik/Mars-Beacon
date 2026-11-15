from pathlib import Path
import json
import pymupdf
from PIL import Image,ImageOps,ImageDraw
out=Path(__file__).resolve().parents[1]/'source_text'
d=pymupdf.open('$MARS_BEACON_DATA');thumbs=[]
for i,p in enumerate(d):
 pix=p.get_pixmap(matrix=pymupdf.Matrix(1,1));im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples);im.thumbnail((640,400));thumb=Image.new('RGB',(640,420),'white');thumb.paste(im,(0,20));ImageDraw.Draw(thumb).text((5,3),f'Page {i+1}',fill='black');thumbs.append(thumb)
canvas=Image.new('RGB',(640*3,420*((len(thumbs)+2)//3)),'white')
for i,im in enumerate(thumbs):canvas.paste(im,((i%3)*640,(i//3)*420))
canvas.save(out/'architecture_pdf_contact.jpg')
print('PDF pages',len(d),flush=True)
from faster_whisper import WhisperModel
model=WhisperModel('base.en',device='cpu',compute_type='int8',cpu_threads=4)
for name in ['4D_Mars_Digital_Twin','Mars_BEACON__Architecture']:
 segments,info=model.transcribe('$MARS_BEACON_DATA'+name+'.mp4',beam_size=1,vad_filter=True)
 with (out/(name+'_transcript.jsonl')).open('w') as f:
  for s in segments:
   f.write(json.dumps({'start':s.start,'end':s.end,'text':s.text})+'\n');f.flush()
 print('TRANSCRIBED',name,flush=True)
