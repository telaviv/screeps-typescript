# Purpose

This codebase is one to play the game screeps. The game starts at main.ts and is run once per "tick".
The game takes place on a grid of grids. Each room has a name like E12N34 that specifies where it lies on the map.
You then build a base in one of these rooms controller "creeps" which are small bots. Each base room has a controller
which limits what capabilities each room has. For instance how many extensions we can have. We can level up the controller
up to level 8 but it takes exponentially longer for each level

# Code Walkthrough

-   room-analysis: code that tries to figure out the layout of a room
-   tasks: Each task is housed with a creep and is associated with instructions on the actions a creep takes
-   roles: A job of a creep
-   empire: This is the manager that has a big picture view of how all the rooms relate to other rooms.
-   construction-features: Describes the "plan" for a room/
-   src/spawn/strategy/rcl-2: A plan for wh
