"""Generate the original Vibe Robots GLB kit and portrait renders.

Run with:
  blender --background --python tools/blender/build_assets.py

The geometry is intentionally procedural: the checked-in script is the source of
truth, while the generated .blend and .glb files make the art pipeline editable
and keep production builds independent from Blender.
"""

from __future__ import annotations

import math
import subprocess
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "public" / "assets" / "models"
ROBOT_DIR = MODEL_DIR / "robots"
PORTRAIT_DIR = ROOT / "art" / "blender" / "renders"
SOURCE_DIR = ROOT / "art" / "blender" / "source"

PALETTE = {
    "plum": (0.035, 0.105, 0.11, 1),
    "steel": (0.16, 0.24, 0.22, 1),
    "cream": (0.95, 0.88, 0.74, 1),
    "peach": (0.95, 0.55, 0.35, 1),
    "amber": (0.96, 0.52, 0.10, 1),
    "sage": (0.28, 0.58, 0.42, 1),
    "blue": (0.18, 0.48, 0.68, 1),
    "red": (0.90, 0.34, 0.27, 1),
    "yellow": (0.98, 0.69, 0.20, 1),
    "green": (0.36, 0.66, 0.43, 1),
    "orange": (0.94, 0.29, 0.08, 1),
    "lavender": (0.48, 0.32, 0.75, 1),
    "cyan": (0.32, 0.72, 0.67, 1),
    "pink": (0.93, 0.45, 0.51, 1),
    "ivory": (0.90, 0.86, 0.73, 1),
}

ROBOTS = [
    ("hammer-bot", "yellow", "hammer"),
    ("hulk-x90", "red", "tank"),
    ("spin-bot", "green", "spinner"),
    ("squash-bot", "orange", "crusher"),
    ("trundle-bot", "lavender", "hauler"),
    ("twitch", "cyan", "antenna"),
    ("twonky", "pink", "walker"),
    ("zoom-bot", "ivory", "racer"),
]


def clean() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.actions):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def material(name: str, color, metallic=0.15, roughness=0.48, emission=None, strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        socket = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        if socket:
            socket.default_value = emission
        strength_socket = bsdf.inputs.get("Emission Strength")
        if strength_socket:
            strength_socket.default_value = strength
    return mat


def finish(obj, name: str, mat, bevel=0.055):
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("Soft bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 4
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def cube(name, location, size, mat, bevel=0.055):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    return finish(obj, name, mat, bevel)


def cylinder(name, location, radius, depth, mat, rotation=(0, 0, 0), vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    return finish(bpy.context.object, name, mat, 0.025)


def sphere(name, location, radius, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=location)
    return finish(bpy.context.object, name, mat, 0)


def torus(name, location, major, minor, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=20, minor_segments=8, location=location, rotation=rotation)
    return finish(bpy.context.object, name, mat, 0)


def parent_all(root, objects):
    for obj in objects:
        obj.parent = root


def stroke(name, points, thickness, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = thickness
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def add_face(parts, body_mat, expression="happy"):
    screen = material("Screen", PALETTE["plum"], metallic=0, roughness=0.4)
    glow = material("Face glow", PALETTE["cream"], metallic=0, roughness=0.5, emission=PALETTE["cream"], strength=0.45)
    blush = material("Apricot blush", (1, .38, .28, 1), metallic=0, roughness=.7)
    bezel = material("Brushed bezel", (.32, .40, .38, 1), metallic=.75, roughness=.28)
    parts.append(cube("face_bezel", (0, -.325, .69), (.62, .16, .40), bezel, .12))
    parts.append(cube("face_screen", (0, -0.345, 0.69), (0.55, 0.16, 0.33), screen, 0.12))
    for x in [-.135, .135]:
        points = [(x + math.cos(i * math.pi / 8) * .052, -.424, .70 + math.sin(i * math.pi / 8) * .062) for i in range(9)]
        parts.append(stroke("eye_l" if x < 0 else "eye_r", points, .018, glow))
        cheek = sphere("blush", (x * 1.25, -.423, .62), .036, blush)
        cheek.scale = (1, .22, .65)
        parts.append(cheek)
    parts.append(stroke("smile", [(math.cos(i * math.pi / 8) * .031, -.424, .64 - math.sin(i * math.pi / 8) * .018) for i in range(9)], .009, glow))
    return body_mat


def add_wheels(parts, dark, count=4, radius=0.16, y_front=-0.25, y_back=0.25, x=0.37):
    for side in (-1, 1):
        for y in (y_front, y_back) if count == 4 else (0,):
            parts.append(cylinder(f"wheel_{side}_{y}", (x * side, y, 0.22), radius, 0.12, dark, rotation=(0, math.pi / 2, 0), vertices=16))


def make_robot(robot_id: str, color_name: str, silhouette: str):
    clean()
    root = bpy.data.objects.new("RobotRoot", None)
    bpy.context.collection.objects.link(root)
    root["robot_id"] = robot_id
    root["animation_contract"] = "idle,move,turn,bump,hit,power-down,respawn,victory"

    body = material(f"{color_name.title()} paint", PALETTE[color_name], metallic=0.38, roughness=0.28)
    accent = material("Warm steel", PALETTE["steel"], metallic=0.55, roughness=0.34)
    cream = material("Warm cream", PALETTE["cream"], metallic=0.05, roughness=0.5)
    parts = []

    body_size = {
        "tank": (0.82, 0.72, 0.48), "racer": (0.70, 0.92, 0.30), "spinner": (0.62, 0.62, 0.48),
        "crusher": (0.72, 0.72, 0.50), "hauler": (0.72, 0.78, 0.54), "antenna": (0.56, 0.58, 0.48),
        "walker": (0.58, 0.55, 0.52), "hammer": (0.65, 0.62, 0.54),
    }[silhouette]
    shell = sphere("body", (0, 0, .56), 1, body)
    shell.scale = (body_size[0] * .62, body_size[1] * .60, .43)
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    parts.append(shell)
    parts.append(torus("shell_seam", (0, 0, .50), body_size[0] * .51, .022, cream))
    for x in [-1, 1]:
        parts.append(cylinder("ear_cap", (x * body_size[0] * .55, -.04, .65), .105, .09, cream, rotation=(0, math.pi / 2, 0)))
        parts.append(cylinder("ear_screw", (x * (body_size[0] * .55 + .048), -.04, .65), .032, .008, accent, rotation=(0, math.pi / 2, 0)))
    add_face(parts, body, "tank" if silhouette == "tank" else "happy")

    if silhouette in {"tank", "racer", "crusher", "hauler", "antenna"}:
        add_wheels(parts, accent, count=4, radius=0.19 if silhouette == "tank" else 0.14, x=body_size[0] / 2 + 0.02)
    if silhouette == "hammer":
        for x in (-0.22, 0.22):
            parts.append(cube(f"boot_{x}", (x, 0.03, 0.15), (0.22, 0.32, 0.25), accent, 0.065))
        parts.append(cylinder("hammer_handle", (0.45, -0.02, 0.82), 0.045, 0.72, accent, rotation=(math.pi / 2, 0, 0), vertices=12))
        parts.append(cube("hammer_head", (0.45, -0.37, 0.92), (0.36, 0.28, 0.28), body, 0.055))
    elif silhouette == "tank":
        parts.append(cylinder("tank_beacon", (0, 0.05, 0.82), 0.10, 0.16, body, vertices=12))
        parts.append(sphere("tank_light", (0, 0.05, 0.93), 0.065, cream))
    elif silhouette == "spinner":
        parts.append(cylinder("spinner_tip", (0, 0, 0.12), 0.08, 0.26, accent, vertices=12))
        parts.append(torus("spinner_ring", (0, 0, 0.93), 0.28, 0.045, body))
    elif silhouette == "crusher":
        parts.append(cube("crusher_scoop", (0, -0.49, 0.23), (0.58, 0.30, 0.18), cream, 0.04))
        for x in (-0.22, 0, 0.22):
            parts.append(cube(f"crusher_tooth_{x}", (x, -0.68, 0.20), (0.12, 0.18, 0.16), cream, 0.025))
    elif silhouette == "hauler":
        for x in (-0.20, 0.20):
            parts.append(cube(f"cargo_{x}", (x, 0.32, 0.92), (0.34, 0.34, 0.42), cream, 0.035))
        parts.append(cube("cargo_rail", (0, 0.34, 0.72), (0.78, 0.08, 0.12), body, 0.025))
    elif silhouette == "antenna":
        for x in (-0.16, 0.16):
            parts.append(cylinder(f"antenna_{x}", (x, 0, 1.02), 0.025, 0.55, accent, vertices=10))
            parts.append(sphere(f"antenna_glow_{x}", (x, 0, 1.30), 0.075, cream))
    elif silhouette == "walker":
        for x in (-0.25, 0.25):
            for y in (-0.10, 0.22):
                parts.append(cylinder(f"leg_{x}_{y}", (x, y, 0.18), 0.055, 0.38, accent, rotation=(0.25 * (-1 if y < 0 else 1), 0, 0), vertices=10))
                parts.append(sphere(f"foot_{x}_{y}", (x, y - 0.03, 0.02), 0.10, body))
    elif silhouette == "racer":
        parts.append(cube("racer_nose", (0, -0.48, 0.26), (0.42, 0.42, 0.18), body, 0.10))
        parts.append(cube("rear_wing", (0, 0.42, 0.55), (0.78, 0.10, 0.10), accent, 0.025))
        for x in (-0.31, 0.31):
            parts.append(cube(f"wing_post_{x}", (x, 0.39, 0.42), (0.06, 0.08, 0.26), accent, 0.015))

    # Machined details read at close zoom and in the large driver portraits.
    rubber = material("Graphite rubber", (.022, .031, .033, 1), metallic=0, roughness=.82)
    alloy = material("Machined alloy", (.49, .59, .58, 1), metallic=.8, roughness=.26)
    lamp = material("Signal glass", (1, .58, .16, 1), metallic=.18, roughness=.19, emission=(1, .26, .03, 1), strength=.7)
    parts.append(cube("underslung_chassis", (0, .04, .30), (body_size[0]*.88, body_size[1]*.87, .16), accent, .035))
    parts.append(cube("rear_service_panel", (0, body_size[1]*.53, .58), (.32, .035, .26), accent, .028))
    for z in [.51, .56, .61, .66]:
        parts.append(cube("cooling_vent", (0, body_size[1]*.56, z), (.23, .024, .017), rubber, .006))
    for side in [-1, 1]:
        parts.append(cube("shoulder_stripe", (side*body_size[0]*.28, -.04, .929), (.05, .23, .018), cream, .009))
        parts.append(sphere("front_running_light", (side*.235, -.355, .42), .029, lamp))
        for z in [.48, .79]:
            parts.append(cylinder("panel_fastener", (side*body_size[0]*.52, -.08, z), .018, .014, alloy, rotation=(0, math.pi/2, 0), vertices=8))
    if silhouette in {"tank", "racer", "crusher", "hauler", "antenna"}:
        radius = .19 if silhouette == "tank" else .14
        for side in [-1, 1]:
            x = (body_size[0]/2+.085)*side
            for y in [-.25, .25]:
                parts.append(cylinder("alloy_hub", (x, y, .22), radius*.6, .024, alloy, rotation=(0, math.pi/2, 0), vertices=20))
                parts.append(cylinder("hub_axle", (x+side*.015, y, .22), radius*.22, .03, body, rotation=(0, math.pi/2, 0), vertices=12))
                for i in range(14):
                    angle = i*math.tau/14
                    tread = cube("tire_tread", (x-side*.06, y+math.sin(angle)*radius, .22+math.cos(angle)*radius), (.12,.028,.022), rubber, .006)
                    tread.rotation_euler.x = -angle
                    parts.append(tread)
    if silhouette == "hammer":
        for side in [-1, 1]:
            parts.append(cylinder("ankle_pivot", (side*.23, -.09, .25), .07, .06, alloy, rotation=(math.pi/2,0,0)))
            parts.append(cube("boot_sole", (side*.22, .01, .045), (.24,.35,.045), rubber,.012))
        parts.append(cube("hammer_strike_face", (.45,-.52,.92), (.30,.035,.22), alloy,.03))
        for y in [-.18,-.1,0,.08]:
            parts.append(torus("handle_grip", (.45,y,.82), .049,.009,rubber,rotation=(math.pi/2,0,0)))
    if silhouette == "spinner":
        for i in range(8):
            a=i*math.tau/8
            parts.append(sphere("ring_rivet", (math.sin(a)*.28,math.cos(a)*.28,.962),.018,alloy))
    parent_all(root, parts)
    # All motion is on RobotRoot; merge its static parts by material to keep
    # eight-character races inexpensive without changing the animation contract.
    groups = {}
    for part in parts:
        groups.setdefault(part.data.materials[0].name, []).append(part)
    for name, objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        bpy.context.object.name = "robot_" + name.replace(" ", "_").lower()
    add_animation_contract(root)
    return root


def add_animation_contract(root):
    root.animation_data_create()
    specs = {
        "idle": [(1, (0, 0, 0), (1, 1, 1), 0), (16, (0, 0, 0.035), (1, 1, 1), 0.025), (31, (0, 0, 0), (1, 1, 1), 0)],
        "move": [(1, (0, 0.05, 0), (1, 1, 1), 0), (8, (0, -0.04, 0.09), (1.03, 0.98, 0.95), 0), (16, (0, 0, 0), (1, 1, 1), 0)],
        "turn": [(1, (0, 0, 0), (1, 1, 1), -0.08), (8, (0, 0, 0.05), (0.98, 1.03, 0.96), 0.10), (16, (0, 0, 0), (1, 1, 1), 0)],
        "bump": [(1, (0, 0, 0), (1, 1, 1), 0), (5, (0, 0.12, 0), (1.05, 0.90, 1.02), 0), (12, (0, 0, 0), (1, 1, 1), 0)],
        "hit": [(1, (0, 0, 0), (1, 1, 1), 0), (4, (-0.08, 0, 0.05), (1.04, 0.94, 0.96), -0.13), (8, (0.06, 0, 0), (0.97, 1.03, 1), 0.09), (15, (0, 0, 0), (1, 1, 1), 0)],
        "power-down": [(1, (0, 0, 0), (1, 1, 1), 0), (24, (0, 0, -0.12), (1.04, 1.04, 0.72), 0)],
        "respawn": [(1, (0, 0, 0.45), (0.08, 0.08, 0.08), 0), (12, (0, 0, 0.10), (1.12, 1.12, 0.82), 0), (24, (0, 0, 0), (1, 1, 1), 0)],
        "victory": [(1, (0, 0, 0), (1, 1, 1), 0), (10, (0, 0, 0.35), (0.92, 0.92, 1.10), 0.16), (20, (0, 0, 0), (1.08, 1.08, 0.90), -0.16), (30, (0, 0, 0.22), (1, 1, 1), 0.16), (40, (0, 0, 0), (1, 1, 1), 0)],
    }
    for name, keys in specs.items():
        action = bpy.data.actions.new(name)
        root.animation_data.action = action
        for frame, location, scale, yaw in keys:
            root.location = location
            root.scale = scale
            root.rotation_euler = (0, 0, yaw)
            root.keyframe_insert("location", frame=frame)
            root.keyframe_insert("scale", frame=frame)
            root.keyframe_insert("rotation_euler", frame=frame)
        for curve in action.fcurves:
            for point in curve.keyframe_points:
                point.interpolation = "BEZIER"
        track = root.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end = action.frame_range[1]
    root.animation_data.action = None
    root.location = (0, 0, 0)
    root.scale = (1, 1, 1)
    root.rotation_euler = (0, 0, 0)


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = True
    scene.world.color = (0.3, 0.3, 0.3)
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    bpy.ops.object.light_add(type="AREA", location=(3, -4, 6))
    key = bpy.context.object
    key.data.energy = 850
    key.data.color = (1.0, 0.88, 0.70)
    key.data.shape = "DISK"
    key.data.size = 5
    bpy.ops.object.light_add(type="AREA", location=(-4, 1, 4))
    fill = bpy.context.object
    fill.data.energy = 500
    fill.data.color = (0.70, 0.86, 1.0)
    fill.data.size = 4
    # Keep the robot large in the transparent square so 34–60 px UI portraits
    # remain expressive without a runtime crop or oversized source texture.
    bpy.ops.object.camera_add(location=(1.55, -2.75, 1.55))
    camera = bpy.context.object
    direction = Vector((0, 0, 0.58)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 58
    scene.camera = camera


def export_robot(robot_id: str):
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    ROBOT_DIR.mkdir(parents=True, exist_ok=True)
    PORTRAIT_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_DIR / f"{robot_id}.blend"))
    bpy.ops.export_scene.gltf(
        filepath=str(ROBOT_DIR / f"{robot_id}.glb"), export_format="GLB", export_animations=True,
        export_nla_strips=True, export_cameras=False, export_lights=False, export_yup=True,
    )
    setup_render()
    bpy.context.scene.render.filepath = str(PORTRAIT_DIR / f"{robot_id}.png")
    bpy.ops.render.render(write_still=True)
    subprocess.run(["cwebp", "-quiet", "-q", "86", str(PORTRAIT_DIR / f"{robot_id}.png"), "-o", str(ROOT / "public/assets/images/robots" / f"{robot_id}.webp")], check=True)


def make_gear(gold):
    ring = torus("gear", (0, 0, 0), .24, .075, gold)
    teeth = []
    for i in range(8):
        a = i * math.pi / 4
        tooth = cube("gear_tooth", (math.sin(a)*.31, math.cos(a)*.31, 0), (.12,.14,.105), gold, .018)
        tooth.rotation_euler.z = -a
        teeth.append(tooth)
    bpy.ops.object.select_all(action="DESELECT")
    ring.select_set(True)
    for tooth in teeth: tooth.select_set(True)
    bpy.context.view_layer.objects.active = ring
    bpy.ops.object.join()
    ring.name = "gear"
    return ring


def make_factory_kit():
    clean()
    steel = material("Sage enamel", (.24, .40, .33, 1), metallic=0.05, roughness=0.65)
    cream = material("Cream tile", PALETTE["cream"], metallic=0.10, roughness=0.50)
    wood = material("Warm wood", (0.53, 0.30, 0.15, 1), metallic=0, roughness=0.62)
    amber = material("Amber belt", (.90, .48, .28, 1), metallic=0.04, roughness=0.65)
    blue = material("Blue belt", (.28, .60, .51, 1), metallic=0.04, roughness=0.65)
    mint = material("Repair glow", PALETTE["sage"], metallic=0.12, roughness=0.35, emission=PALETTE["sage"], strength=1.2)
    red = material("Laser glow", PALETTE["red"], metallic=0.22, roughness=0.28, emission=PALETTE["red"], strength=2.0)
    gold = material("Checkpoint gold", PALETTE["yellow"], metallic=0.58, roughness=0.26)
    pieces = [
        cube("tile_base", (0, 0, 0), (0.94, 0.94, 0.16), cream, 0.065),
        cube("tile_underlay", (0, 0, 0), (0.98, 0.98, 0.12), wood, 0.05),
        cube("wall", (0, 0, 0), (0.94, 0.10, 0.42), steel, 0.05),
        cube("conveyor", (0, 0, 0), (0.80, 0.80, 0.08), amber, 0.055),
        cube("express_conveyor", (0, 0, 0), (0.80, 0.80, 0.08), blue, 0.055),
        make_gear(gold),
        cube("pusher", (0, 0, 0), (0.56, 0.22, 0.30), amber, 0.055),
        cube("laser", (0, 0, 0), (0.28, 0.42, 0.46), red, 0.055),
        cube("repair", (0, 0, 0), (0.62, 0.62, 0.07), mint, 0.08),
        cylinder("checkpoint", (0, 0, 0), 0.28, 0.65, gold, vertices=12),
        cube("dock", (0, 0, 0), (0.78, 0.78, 0.07), lavender := material("Dock lavender", PALETTE["lavender"], metallic=0.15, roughness=0.42), 0.08),
        torus("pit_rim", (0, 0, 0), 0.34, 0.07, wood),
    ]
    for piece in pieces:
        piece["kit_piece"] = True
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_DIR / "factory-kit.blend"))
    bpy.ops.export_scene.gltf(filepath=str(MODEL_DIR / "factory-kit.glb"), export_format="GLB", export_animations=False, export_cameras=False, export_lights=False, export_yup=True)


def main():
    for robot_id, color_name, silhouette in ROBOTS:
        make_robot(robot_id, color_name, silhouette)
        export_robot(robot_id)
    make_factory_kit()
    print(f"Generated Vibe Robots assets in {MODEL_DIR}")


if __name__ == "__main__":
    main()
