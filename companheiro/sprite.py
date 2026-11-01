"""Personagem RGBA em processo GTK separado do painel Tk.

Usa X11/XWayland para posicionamento e keep-above no Ubuntu/Wayland.
Nenhum fallback opaco: se RGBA/composição faltarem, informa erro.
"""
import json
import math
import sys

WIDTH, HEIGHT = 140, 90


def render_sprite(frame):
    """Superfície com alfa real; mesmo boneco vetorial da primeira versão."""
    import cairo
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, WIDTH, HEIGHT)
    cr = cairo.Context(surface)
    cr.set_operator(cairo.OPERATOR_SOURCE)
    cr.set_source_rgba(0, 0, 0, 0)
    cr.paint()
    cr.set_operator(cairo.OPERATOR_OVER)
    x = 70 + 25 * math.sin(frame / 20)
    cr.set_source_rgb(.655, .545, .98)
    cr.arc(x, 35, 20, 0, math.tau)
    cr.fill()
    cr.set_source_rgb(0, 0, 0)
    for eye in (-8, 8):
        cr.arc(x + eye, 29, 2, 0, math.tau)
        cr.fill()
    cr.set_line_width(5)
    cr.set_line_cap(cairo.LINE_CAP_ROUND)
    step = 5 if frame % 12 < 6 else -5
    for side in (-1, 1):
        cr.move_to(x + side * 10, 53)
        cr.line_to(x + side * (12 - step), 72)
        cr.stroke()
    surface.flush()
    return surface


def input_region(surface):
    """Somente pixels visíveis recebem mouse; o entorno deixa os cliques passar."""
    import cairo
    region = cairo.Region()
    data, stride = surface.get_data(), surface.get_stride()
    alpha = 3 if sys.byteorder == 'little' else 0
    for y in range(surface.get_height()):
        start = None
        for x in range(surface.get_width() + 1):
            visible = x < surface.get_width() and data[y * stride + x * 4 + alpha] > 0
            if visible and start is None:
                start = x
            elif not visible and start is not None:
                region.union(cairo.RectangleInt(start, y, x - start, 1))
                start = None
    return region


def main():
    import gi
    gi.require_version('Gtk', '3.0')
    gi.require_version('Gdk', '3.0')
    from gi.repository import Gtk, Gdk, GLib
    import cairo
    ok, _ = Gtk.init_check([])
    if not ok:
        raise RuntimeError('Não foi possível acessar a sessão gráfica')
    screen = Gdk.Screen.get_default()
    visual = screen.get_rgba_visual()
    if visual is None or not screen.is_composited():
        raise RuntimeError('A sessão não oferece RGBA com composição; não será exibido um retângulo opaco')
    window = Gtk.Window(type=Gtk.WindowType.TOPLEVEL)
    window.set_title('Companheiro SNN — personagem transparente')
    window.set_visual(visual)
    window.set_app_paintable(True)
    window.set_decorated(False)
    window.set_resizable(False)
    window.set_keep_above(True)
    window.set_skip_taskbar_hint(True)
    window.set_skip_pager_hint(True)
    window.set_accept_focus(False)
    window.set_focus_on_map(False)
    window.set_type_hint(Gdk.WindowTypeHint.UTILITY)
    window.set_default_size(WIDTH, HEIGHT)
    # Evita fundo e sombra de temas que desenham decoração no lado do cliente.
    css = Gtk.CssProvider()
    css.load_from_data(b'window { background-color: transparent; background-image: none; box-shadow: none; border: none; }')
    window.get_style_context().add_provider(css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
    window.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK)
    frame, dragging = 0, False
    surface = render_sprite(frame)
    menu = Gtk.Menu()
    hide = Gtk.MenuItem(label='Ocultar personagem')
    hide.connect('activate', lambda *_: window.destroy())
    menu.append(hide)
    menu.show_all()

    def draw(widget, cr):
        cr.set_operator(cairo.OPERATOR_SOURCE)
        cr.set_source_surface(surface, 0, 0)
        cr.paint()
        return True

    def press(widget, event):
        nonlocal dragging
        if event.button == 1:
            dragging = True
            window.begin_move_drag(1, int(event.x_root), int(event.y_root), event.time)
        elif event.button == 3:
            menu.popup_at_pointer(event)
        return True

    def release(*_):
        nonlocal dragging
        dragging = False
        return False

    def animate():
        nonlocal frame, surface
        # Pausa o movimento interno durante arraste para manter a pegada no personagem.
        if not dragging:
            frame += 1
            surface = render_sprite(frame)
            window.input_shape_combine_region(input_region(surface))
            window.queue_draw()
        return True

    def parent_closed(channel, condition):
        # O pai mantém stdin aberto. EOF (inclusive falha do painel) encerra o filho.
        window.destroy()
        return False

    def mapped(*_):
        window.input_shape_combine_region(input_region(surface))
        print(json.dumps(dict(ready=True, backend=type(Gdk.Display.get_default()).__name__,
                              rgba=visual.get_depth(), composited=screen.is_composited(),
                              decorated=window.get_decorated(), width=WIDTH, height=HEIGHT)), flush=True)

    window.connect('draw', draw)
    window.connect('button-press-event', press)
    window.connect('button-release-event', release)
    window.connect('destroy', lambda *_: Gtk.main_quit())
    window.connect('map-event', mapped)
    GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_HUP | GLib.IO_IN | GLib.IO_ERR, parent_closed)
    window.show_all()
    GLib.timeout_add(80, animate)
    # Diagnóstico optativo: abre só este personagem e fecha automaticamente.
    if '--verificar' in sys.argv:
        GLib.timeout_add(1500, lambda: (window.destroy(), False)[1])
    Gtk.main()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Personagem indisponível: {error}', file=sys.stderr, flush=True)
        sys.exit(1)
