from engine.ir import CameraMovement, ObjectRef, ShotSpec

_ALL_MOVEMENTS: list[CameraMovement] = [
    "static",
    "pan_left",
    "pan_right",
    "tilt_up",
    "tilt_down",
    "zoom_in",
    "zoom_out",
    "tracking",
    "handheld",
]

SHOTS: list[ShotSpec] = [
    ShotSpec(
        subject="a glass marble at the top of a wooden chain-reaction track",
        setting="a sunlit workshop table, close-up",
        action="the marble is released and begins rolling down the track",
        camera_movement=movement,
        time_of_day="day",
        palette=["#8A5A32", "#EDEEF0"],
        mood="playful, precise",
        lighting="soft",
        duration_sec=6,
        aspect_ratio="16:9",
        excludes=["text", "people"],
        object_refs=[ObjectRef(asset_id="ast_marble01", label="glass marble")],
    )
    for movement in _ALL_MOVEMENTS
]
