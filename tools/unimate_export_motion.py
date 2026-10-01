"""Decode UniMate motion features (.npy, T x 22 x 12) into the JSON our Three.js bridge loads.

Run inside the UniMate conda environment, from the UniMate repository root, after sampling
with the "mixamo" object type (22-joint core, same joint names and order as our rig):

    python /path/to/themove/tools/unimate_export_motion.py \
        --motion outputs/<exp>/samples/motions/mixamo-walk-rep_0-0.npy \
        --cond dataset/features/mixamo/cond.npy \
        --object-type <mixamo object type key> \
        --out walk.unimate.json

Output format 'unimate-global-v1' is documented in src/unimate/bridge.js.
"""

import argparse
import json
import sys

import numpy as np

MIXAMO_CORE = [
    "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
    "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
]


def load_cond(path, object_type):
    cond = np.load(path, allow_pickle=True).item()
    if object_type not in cond:
        raise SystemExit(f"object type {object_type!r} not in {path}; available: {sorted(cond)[:10]}...")
    return cond[object_type]


def global_rotations(anim):
    """World rotations per frame/joint as (T, J, 4) xyzw from an Animation (local rotations + parents)."""
    local = np.array(anim.rotations.qs)  # (T, J, 4) wxyz
    parents = anim.parents
    out = np.zeros_like(local)
    for j, p in enumerate(parents):
        if p < 0:
            out[:, j] = local[:, j]
        else:
            out[:, j] = quat_mul(out[:, p], local[:, j])
    return out[..., [1, 2, 3, 0]]


def quat_mul(a, b):
    aw, ax, ay, az = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    bw, bx, by, bz = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
    return np.stack([
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    ], axis=-1)


def rest_positions(offsets, parents):
    pos = np.zeros_like(offsets)
    for j, p in enumerate(parents):
        pos[j] = offsets[j] if p < 0 else pos[p] + offsets[j]
    return pos


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--motion", required=True)
    parser.add_argument("--cond", required=True)
    parser.add_argument("--object-type", required=True)
    parser.add_argument("--fps", type=float, default=30.0)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    try:
        from unimate.utils.motion_utils import recover_unimate_anim_from_rot
    except ImportError:
        sys.exit("Run this from the UniMate repo root inside its conda env (unimate package not importable).")

    cond = load_cond(args.cond, args.object_type)
    parents = cond["parents"]
    offsets = cond["tpos_offsets"]
    names = [str(n).replace("mixamorig:", "") for n in cond.get("joint_names", MIXAMO_CORE)]
    if names != MIXAMO_CORE:
        sys.exit(f"Skeleton is not the 22-joint mixamo core (got {len(names)} joints). Re-extract with --mixamo_core_joints.")

    data = np.load(args.motion)
    anim = recover_unimate_anim_from_rot(data, parents, offsets)
    rest = rest_positions(offsets, parents)
    motion = {
        "format": "unimate-global-v1",
        "fps": args.fps,
        "joints": MIXAMO_CORE,
        "parents": [int(p) for p in parents],
        "restPositions": rest.tolist(),
        "globalRotations": global_rotations(anim).round(6).tolist(),
        "rootPositions": np.array(anim.positions[:, 0]).round(5).tolist(),
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(motion, fh)
    print(f"wrote {args.out}: {len(motion['rootPositions'])} frames")


if __name__ == "__main__":
    main()
