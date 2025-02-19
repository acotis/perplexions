
use sfml::graphics::*;
use sfml::system::*;

// Utility function to update the "view" of the window. Call this
// after a resize event to stop it from getting all stretched out.

pub fn update_view(win: &mut RenderWindow) {
    let size = win.size();
    win.set_view(
        &View::from_rect(
            FloatRect::new(0.0, 0.0, size.x as f32, size.y as f32)
        ).expect("couldn't create view"));
}

// Draw a regular polygon with a given number of sides, rotation
// from its default orientation, center, radius, color, outline
// thickness, and outline color.

pub fn polygon(win: &mut RenderWindow, side_count: u32, rotation: f32,
                center: (f32, f32), radius: f32, color: Color,
                outline_thickness: f32, outline_color: Color) {
    let mut cs = CircleShape::new(radius, side_count as usize);
    cs.set_origin(Vector2::new(radius, radius));
    cs.set_position(Vector2::new(center.0, center.1));
    cs.rotate(rotation * 360.0);
    cs.set_fill_color(color);
    cs.set_outline_thickness(outline_thickness);
    cs.set_outline_color(outline_color);
    win.draw(&cs);
}

// Proxy functions to put calls in to draw_polygon.

pub fn square(
    win: &mut RenderWindow,
    center: (f32, f32),
    radius: f32,
    color: Color,
    outline_thickness: f32,
    outline_color: Color
) {
    polygon(win,
        4,
        0.125,
        center,
        radius,
        color,
        outline_thickness,
        outline_color
    );
}

pub fn square_plain(
    win: &mut RenderWindow,
    center: (f32, f32),
    radius: f32,
    color: Color
) {
    square(
        win,
        center,
        radius,
        color,
        0.0,
        Color::TRANSPARENT
    );
}

pub fn circle(
    win: &mut RenderWindow,
    center: (f32, f32),
    radius: f32,
    color: Color,
    outline_thickness: f32,
    outline_color: Color
) {
    polygon(
        win,
        50,
        0.0,
        center,
        radius,
        color,
        outline_thickness,
        outline_color
    );
}

pub fn circle_plain(
    win: &mut RenderWindow,
    center: (f32, f32),
    radius: f32,
    color: Color
) {
    circle(
        win,
        center,
        radius,
        color,
        0.0,
        Color::TRANSPARENT
    );
}

// Draw a line from one point to another.

pub fn line(
    win: &mut RenderWindow,
    a: (f32, f32),
    b: (f32, f32),
    color: Color,
    width: f32
) {
    let dist  = f32::hypot(b.1 - a.1, b.0 - a.0);
    let angle = f32::atan2(b.1 - a.1, b.0 - a.0);
    let mut rs = RectangleShape::new();
    rs.set_size(Vector2f::new(dist, width));
    rs.set_origin(Vector2f::new(0.0, width/2.0));
    rs.set_position(Vector2f::new(a.0, a.1));
    rs.rotate(angle * 180.0/std::f32::consts::PI);
    rs.set_fill_color(color);
    win.draw(&rs);

    let mut cs = CircleShape::new(width/2.0, 50);
    cs.set_origin(Vector2::new(width/2.0, width/2.0));
    cs.set_position(Vector2::new(a.0, a.1));
    cs.set_fill_color(color);
    win.draw(&cs);

    cs.set_position(Vector2::new(b.0, b.1));
    win.draw(&cs);
}

