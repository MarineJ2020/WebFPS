Drop your equirectangular skybox file here, named exactly:

    skybox.exr

It's loaded automatically on startup (see `src/render/Skybox.ts`) and used as both the
scene background and its environment/reflection map. If no file is present, the game just
falls back to the flat sky-blue background - nothing else needs to change.
