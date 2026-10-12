"""生成 prom-editor 应用图标：紫色渐变圆角方块 + 火焰图形。
输出：
  build/appicon.png        1024x1024（macOS / 通用源图）
  build/windows/icon.ico   多尺寸 ICO（Windows 可执行文件图标）
"""
from PIL import Image, ImageDraw

S = 1024  # 画布

# ---- 满幅渐变底色（#7c6cff -> #9e8cff，与应用主色一致）----
# Windows 桌面图标惯例为全出血方块（圆角由系统在需要处裁剪），
# 避免圆角外的透明区域在 ICO/资源管理器中渲染成黑色四角。
C1 = (124, 108, 255)
C2 = (158, 140, 255)
icon = Image.new("RGB", (S, S), C1)
px = icon.load()
for y in range(S):
    for x in range(0, S, 1):
        t = (x + y) / (2 * S)
        px[x, y] = tuple(int(C1[i] + (C2[i] - C1[i]) * t) for i in range(3))


def cubic(p0, p1, p2, p3, n=60):
    pts = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)

# ---- 外火焰（白色）----
flame_outer = (
    cubic((512, 150), (560, 300), (720, 350), (724, 536), 80)  # 右缘
    + cubic((724, 536), (724, 700), (620, 800), (512, 806), 80)[1:]  # 右下弧
    + cubic((512, 806), (404, 800), (300, 700), (300, 536), 80)[1:]  # 左下弧
    + cubic((300, 536), (300, 372), (404, 322), (444, 282), 60)[1:]  # 左缘上
    + cubic((444, 282), (452, 330), (468, 372), (500, 392), 40)[1:]  # 内凹舌
    + cubic((500, 392), (486, 300), (494, 220), (512, 150), 40)[1:]  # 回到顶点
)
d.polygon(flame_outer, fill=(255, 255, 255, 255))

# ---- 内火焰（深色，制造层次）----
INNER = (96, 80, 220, 255)
flame_inner = (
    cubic((512, 372), (546, 448), (628, 470), (630, 562), 60)
    + cubic((630, 562), (630, 656), (576, 716), (512, 718), 60)[1:]
    + cubic((512, 718), (448, 716), (394, 656), (394, 562), 60)[1:]
    + cubic((394, 562), (394, 488), (430, 458), (462, 428), 40)[1:]
    + cubic((462, 428), (472, 458), (486, 476), (504, 482), 30)[1:]
    + cubic((504, 482), (496, 440), (500, 402), (512, 372), 30)[1:]
)
d.polygon(flame_inner, fill=INNER)

icon = Image.alpha_composite(icon.convert("RGBA"), layer)

icon.save("build/appicon.png")

# ---- Windows 多尺寸 ICO ----
icon.save(
    "build/windows/icon.ico",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print("icon generated: build/appicon.png + build/windows/icon.ico")
