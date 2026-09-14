"""Editable, original garden workshop props for the cozy visual slice."""
import sys
import math
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).parent))
from build_assets import clean, cube, cylinder, sphere, torus, material, ROOT, SOURCE_DIR, MODEL_DIR

clean()
wood = material('Honey oak', (.53, .31, .15, 1), metallic=0, roughness=.8)
light = material('Birch trim', (.85, .65, .39, 1), metallic=0, roughness=.8)
cream = material('Ivory ceramic', (.96, .88, .69, 1), metallic=0, roughness=.7)
sage = material('Sage foliage', (.25, .48, .29, 1), metallic=0, roughness=.9)
mint = material('Sunlit foliage', (.48, .67, .31, 1), metallic=0, roughness=.9)
pink = material('Blossoms', (.96, .53, .47, 1), metallic=0, roughness=.9)
terracotta = material('Terracotta', (.65, .29, .18, 1), metallic=0, roughness=.9)
metal = material('Garden enamel', (.10, .26, .23, 1), metallic=.1, roughness=.6)
glass = material('Greenhouse glass', (.47, .73, .65, 1), metallic=.1, roughness=.3)
glow = material('Lantern glow', (1, .75, .3, 1), metallic=0, roughness=.4, emission=(1, .68, .22, 1), strength=1.5)


def prop(name, build):
    old = set(bpy.data.objects)
    build()
    meshes = [o for o in bpy.data.objects if o not in old and o.type == 'MESH']
    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    # Collapse by material: each prop is only a handful of draw calls.
    mats = set(o.data.materials[0] for o in meshes)
    groups = [(mat, [o for o in meshes if o.data.materials[0] == mat]) for mat in mats]
    for mat, group in groups:
        bpy.ops.object.select_all(action='DESELECT')
        for o in group: o.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = name + '_' + mat.name
        obj.parent = parent
    return parent


def leaf(location, scale, mat):
    obj = sphere('leaf', location, 1, mat)
    obj.scale = scale


def planter():
    cylinder('pot', (0, 0, .24), .28, .44, terracotta)
    torus('lip', (0, 0, .46), .28, .035, light)
    cylinder('soil', (0, 0, .47), .25, .02, wood)
    for i in range(7):
        a = i * 2.4
        leaf((math.sin(a) * .18, math.cos(a) * .18, .65 + (i % 3) * .12), (.16, .14, .30), sage if i % 2 else mint)
    for i in range(4):
        a = i * 1.8
        sphere('flower', (math.sin(a)*.2, math.cos(a)*.2, .99), .085, pink)
        sphere('pollen', (math.sin(a)*.2, math.cos(a)*.2-.05, 1.03), .028, cream)


def tree():
    cylinder('trunk', (0, 0, .85), .13, 1.8, wood)
    for i in range(10):
        a = i * 2.4
        leaf((math.sin(a)*.50, math.cos(a)*.50, 1.6 + (i % 3)*.30), (.54, .54, .53), sage if i % 3 else mint)
    cylinder('tree_pot', (0, 0, .15), .48, .36, terracotta)
    torus('tree_pot_rim', (0, 0, .32), .48, .05, light)


def lantern():
    cylinder('base', (0, 0, .06), .30, .12, metal)
    cylinder('post', (0, 0, .82), .055, 1.60, metal)
    cylinder('lamp_base', (0, 0, 1.54), .23, .10, metal)
    cylinder('warm_glass', (0, 0, 1.80), .17, .46, glow, vertices=8)
    for x in [-.16,.16]:
        for y in [-.16,.16]:
            cube('cage', (x, y, 1.8), (.028, .028, .52), metal, .01)
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=.32, radius2=.07, depth=.27, location=(0,0,2.14))
    bpy.context.object.data.materials.append(metal)
    torus('ring', (0, 0, 2.36), .10, .022, light, rotation=(math.pi/2,0,0))


def bench():
    cube('top', (0, 0, .78), (2.1, .78, .15), light)
    for x in [-.85,.85]:
        for y in [-.24,.24]: cube('leg', (x, y, .36), (.10,.10,.72), wood)
    cube('shelf', (0,0,.24), (1.8,.55,.07), wood)
    for x in [-.55,.1,.58]:
        cube('crate', (x,.04,.97), (.38,.4,.28), wood)
        for i in range(3): cube('slat',(x,-.18,.86+i*.085),(.4,.035,.055),light,.01)
    cylinder('cup',(-.8,-.10,1.05),.12,.32,metal)
    for i in range(3): cylinder('tools',(-.83+i*.04,-.10,1.26),.018,.4,light,rotation=(0,.15*i,0))


def greenhouse():
    cube('plinth',(0,0,.1),(3.4,2,.2),wood)
    cube('glass_body',(0,0,1.12),(3.15,1.8,2),glass,.03)
    for x in [-1.6,-.8,0,.8,1.6]:
        for y in [-.93,.93]: cube('frame',(x,y,1.12),(.07,.07,2.1),light,.01)
    for z in [.25,1.1,2.15]:
        for y in [-.96,.96]: cube('beam',(0,y,z),(3.3,.07,.07),light,.01)
    for y in [-.52,.52]:
        roof=cube('roof',(0,y,2.45),(3.45,1.17,.09),glass,.02)
        roof.rotation_euler.x = math.copysign(-.58,y)
    for x in [-1.7,0,1.7]:
        for y in [-.50,.50]:
            rib=cube('roof_rib',(x,y,2.46),(.065,1.2,.08),light,.01)
            rib.rotation_euler.x=math.copysign(-.58,y)
    cube('ridge',(0,0,2.78),(3.5,.08,.08),light,.01)
    cube('door',(0,-.99,.82),(.64,.08,1.42),metal,.08)
    cube('door_glass',(0,-1.04,1.05),(.47,.03,.75),glass,.05)
    sphere('knob',(.20,-1.10,.70),.05,cream)

for name, build in [('planter',planter),('tree',tree),('lantern',lantern),('workbench',bench),('greenhouse',greenhouse)]: prop(name,build)
SOURCE_DIR.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_DIR/'garden-kit.blend'))
bpy.ops.export_scene.gltf(filepath=str(MODEL_DIR/'garden-kit.glb'),export_format='GLB',export_animations=False,export_cameras=False,export_lights=False)
print('Garden kit complete')
