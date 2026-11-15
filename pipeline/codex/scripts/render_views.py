"""blender -b --python render_views.py -- DATA_DIR [number_of_views]"""
import bpy, sys, json, math
from pathlib import Path
import numpy as np
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];root=Path(args[0]).resolve();n=int(args[1]) if len(args)>1 else 120
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
d=np.load(root/'terrain.npz');verts=d['vertices'];rows,cols=map(int,d['shape'])
faces=[(r*cols+c,(r+1)*cols+c,(r+1)*cols+c+1,r*cols+c+1) for r in range(rows-1) for c in range(cols-1)]
mesh=bpy.data.meshes.new('Measured DEM');mesh.from_pydata(verts.tolist(),[],faces);mesh.update();obj=bpy.data.objects.new('Gale orbital surface',mesh);bpy.context.collection.objects.link(obj)
uv=mesh.uv_layers.new(name='Ortho')
for poly in mesh.polygons:
 for li in poly.loop_indices:
  vi=mesh.loops[li].vertex_index;r,c=divmod(vi,cols);uv.data[li].uv=((c+.5)/cols,1-(r+.5)/rows)
mat=bpy.data.materials.new('Fixed measured appearance');mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(root/'texture.png'));mat.node_tree.links.new(tex.outputs['Color'],em.inputs['Color']);mat.node_tree.links.new(em.outputs[0],out.inputs['Surface']);obj.data.materials.append(mat)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False;scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False;scene.world.color=(0,0,0);scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(0,0,0,1);scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.lens=35;cam.data.sensor_width=36;cam.data.sensor_fit='HORIZONTAL';cam.data.clip_end=2000
(root/'images').mkdir(exist_ok=True);frames=[]
for i in range(n):
 tier=i%3;theta=2*math.pi*(i//3)/(n/3)+tier*.035;rad=[210,200,170][tier];height=[110,160,220][tier]
 cam.location=(rad*math.cos(theta),rad*math.sin(theta),height);cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
 name=f'images/{i:04d}.png';scene.render.filepath=str(root/name);bpy.ops.render.render(write_still=True)
 frames.append({'file_path':name,'transform_matrix':[list(row) for row in cam.matrix_world]})
f=512*35/36
# Hold out complete azimuth groups, not adjacent height tiers at the same angle.
train=[x['file_path'] for i,x in enumerate(frames) if (i//3)%10 not in (0,5)]
val=[x['file_path'] for i,x in enumerate(frames) if (i//3)%10==0]
test=[x['file_path'] for i,x in enumerate(frames) if (i//3)%10==5]
meta=dict(camera_model='OPENCV',fl_x=f,fl_y=f,cx=256,cy=256,w=512,h=512,ply_file_path='seed.ply',frames=frames,train_filenames=train,val_filenames=val,test_filenames=test)
(root/'transforms.json').write_text(json.dumps(meta,indent=2));print('RENDER_COMPLETE',len(frames))
