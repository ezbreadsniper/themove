# Movement and interaction research notes

Short notes from reading up on how shipped games and engines build these systems, and what we took from them.

## Kinematic character controllers
Sources: Unity CharacterController / KCC, Rapier `KinematicCharacterController`, Godot `move_and_slide`, Fauerby's "Improved collision detection and response".

**How they work**
- The character is a kinematic capsule. It is not a rigid body, so the game decides velocity and nothing tips it over.
- **Collide-and-slide.** Move, find the contact, remove the part of the motion that goes into the contact normal, and repeat a few times. This slides along walls and into corners without sticking.
- **Typical settings.** Rapier's defaults:
  - `max_slope_climb_angle` = 45°;
  - `min_slope_slide_angle` = 45°;
  - `snap_to_ground` = 0.2 × height.
  - `autostep` is off by default because it costs a lot.
- **Autostep** climbs an obstacle that is lower than `max_height`, as long as the space above it is free.
- **Snap to ground** keeps the character on a surface that drops away within a threshold. This covers stairs and ramps going down.
- **Slope limit.** A slope steeper than the limit is not climbed, and the character slides down it.

**What we did.** Our world collision is 2.5D: XZ polygon prisms plus height-field walkables. So collide-and-slide becomes:
- sub-step the motion (≤ 0.4 × radius per step, so nothing tunnels);
- push the capsule out of each prism along its normal;
- clip the remaining motion against the collected normals.

Step-up and snap-down use the walkable heights directly (`stepUp` 0.36 m, `snapDown` 0.45 m). Step-up checks for headroom first. The slope limit is 46° and applies only to planar walkables. Stair helices count as steps.

**Narrower legs.** A real capsule's bottom is rounded, and legs are narrower than shoulders. So solids lower than the knee (0.55 m) only block a 0.16 m leg radius. Feet can reach a coffee table's edge, and shin-height landing plates no longer catch the torso.

## Jump feel: coyote time and the jump buffer
- Common values for both windows are 0.06–0.15 s.
- **Coyote time:** a jump pressed shortly after walking off a ledge still fires.
- **Jump buffer:** a jump pressed shortly before landing fires on touchdown.
- We use 0.12 s of coyote time and a 0.14 s buffer.
- Vertical motion is integrated with the average of the old and new velocity. This is exact under constant gravity, so the jump height (0.5 m) does not depend on the frame rate.

## Third-person camera (GTA / RDR / UE spring arm)
**How a spring arm works.** A boom hangs from a pivot over the shoulders:
- it probes for collision with a sphere;
- it retracts instantly when something gets in the way;
- it springs back out slowly ("collision smooth time");
- it has optional positional lag;
- a socket offset gives the over-the-shoulder view.

**What GTA and RDR add.** They swap the shoulder smoothly, and they zoom to a tighter arm and fov when aiming.

**What we did:**
- The pivot lags separately in the horizontal and the vertical. The vertical follows a root that is already step-smoothed, so the camera doesn't bob on stairs.
- The sphere probe is approximated with five rays: the centre plus a ring the size of the probe.
- The probe runs against both the collision solids and the kit's AABB occluders. The occluders cover ceilings and slabs, which have no character collider.
- There is a separate sideways probe for the shoulder offset.
- The arm pulls in instantly and extends back at 3.5/s.

## Physics doors (Half-Life 2, Amnesia, Unity hinge joints)
**How they work.** The leaf is a rigid body on a hinge joint with limits. Opening it uses either:
- an impulse or torque, applied once (Unity's AddTorque impulse); or
- a drag that follows the cursor (Amnesia).

Damping, from joint friction, stops the leaf swinging forever. Physics characters push it by contact.

**What we did.** A small custom solver keeps it deterministic and dependency-free:
- **Inertia.** The leaf's angular inertia is `m·w²/3`.
- **Body push.** A body pushes with an impulse at its contact point, `j = v_rel / (1/m_body + arm²/I)`, so walking into the door opens it in proportion to speed and direction.
- **Doors never push bodies.** A swing that would overlap a body is cut short (bisection) and stops just short of the body. A closing door therefore rests against your back and can never shove you through a wall.
- **Damping and closer.** Angular damping, plus an optional closer spring with a latch-speed zone (real closers speed up over the last few degrees).
- **Stop and latch.** The leaf bounces off the hinge stop with restitution and latches when it is shut.
- **E (interact)** drives a critically damped motor to 85°, holds the door for 3.5 s, then hands it back to the closer.
- **Locked doors** absorb the impulse and rattle.

## Rigid props
cannon-es and Rapier (WASM) were considered and rejected:
- the world is 2.5D;
- props only need to slide, spin and drop;
- determinism and zero dependencies matter more here.

Our props are boxes and upright cylinders, with:
- yaw-only spin;
- Coulomb floor friction;
- spin friction;
- gravity onto walkables;
- positional collision against the static world;
- impulse pushes from capsules, using `(r×n)²/I` for spin;
- sleeping.

Each prop registers a moving collision solid, so characters collide with its real footprint.

## Interaction focus
Shipped third-person games pick the interactable with the best combined score of distance and view angle, not simply the nearest. They require line of sight, and they add hysteresis so the prompt doesn't flicker between neighbours. We score `distance + 1.1 × angle` within each item's radius and a 75° cone, with a 0.15 hysteresis margin.

Line of sight ignores the item's own door leaf and any solid that contains the target point. A seat inside its sofa collider still counts as visible.

## Sources
- Rapier character controller: https://rapier.rs/docs/user_guides/rust/character_controller
- Unreal spring arm / camera: https://docs.unrealengine.com/4.26/Basics/Components/Camera
- Spring arm follow, wall avoidance, over-the-shoulder: https://uhiyama-lab.com/en/notes/ue/camera-spring-arm-guide/
- Godot spring arm: https://docs.godotengine.org/it/4.5/tutorials/3d/spring_arm.html
- Amnesia-style doors: https://www.leadwerks.com/community/topic/15084-doors-amnesia-style
- Hinge door torque impulse: https://discussions.unity.com/t/rigidbody-addtorque-torqueamount-forcemode-impulse-to-rotate-hinge-door-to-desired-angle/1549197
- Coyote time / jump buffering: https://kidscancode.org/godot_recipes/4.x/2d/coyote_time/index.html , https://gamemaker.io/en/blog/flynn-advanced-jump-mechanics
