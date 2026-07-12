# Maze Explorer

It is an endless procedurally generated maze that builds itself one step ahead of you and deletes it. 

## Controls

| Key | Action |
| :--- | :--- |
| `W` / `↑` | Forward |
| `S` / `↓` | Backward |
| `A` / `←` | Left |
| `D` / `→` | Right |
| `Q` / `E` | Turn Left / Right |
| `ESC` | Pause Game |

<img width="800" height="358" alt="ezgif-8d320b66be756045" src="https://github.com/user-attachments/assets/a2321f85-97e0-4f19-b133-304feaede7ef" />

## Features
* Infinite World: It is a chunk based memory that streams forever using deterministic coordinate seeding.
* Custom Renderer: It uses raw ImageData pixel manipulation for walls, floors and ceilings.

## Tech Stack

* HTML5 Canvas API: For the main rendering surface minimap
* Javascript
* Web Workers API: Background thread for chunk generation
* CSS

The project is based on endless theme because the map keeps generating itself and doesn't have an end.
