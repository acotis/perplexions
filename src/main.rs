
use sfml::window::*;
use sfml::graphics::*;
use sfml::graphics::RenderWindow;
use sfml::window::Event::Resized;
use sfml::window::Event::Closed;
use sfml::system::Vector2f;
use sfml::system::Vector2u;

use crate::game::Game;

mod game {
    use super::*;

    struct Tile {}

    pub struct Game {
        aspect_ratio: f32, // derived from initial contents of field
        field: Vec<Vec<Tile>>,
        select_path: Vec<(usize, usize)>,
    }

    impl Game {
        // todo: make this private
        pub fn add_to_select_path(&mut self, x: usize, y: usize) {
            self.select_path.push((x, y));
        }
    }

    impl Game {
        pub fn new() -> Self {
            Self {
                aspect_ratio: 3.0/5.0,
                field: vec![
                    vec![Tile {}, Tile {}],
                    vec![Tile {}],
                    vec![Tile {}, Tile {}, Tile {}],
                    vec![],
                    vec![Tile {}, Tile {}],
                ],
                select_path: vec![],
            }
        }

        pub fn aspect_ratio(&self) -> f32 {
            self.aspect_ratio
        }

        pub fn draw_self(
            &self,
            window: &mut RenderWindow,
            origin: (f32, f32), // position on screen of bottom left corner of game
            width: f32,         // width on screen of game
            debug_border: bool,
        ) {
            let tile_slot_size = width / self.field.len() as f32;
            let tile_size = tile_slot_size * 0.8;
            let outline_thickness = tile_slot_size * 0.05;

            if debug_border {
                self.draw_debug_border(window, origin, width, outline_thickness);
            }

            for (column, tiles) in self.field.iter().enumerate() {
                for (row, tile) in tiles.iter().enumerate() {
                    let mut rs = RectangleShape::new();
                    rs.set_size(Vector2f::new(tile_size, tile_size));
                    rs.set_origin(Vector2f::new(
                        tile_size / 2.0,
                        tile_size / 2.0,
                    ));
                    rs.set_position(Vector2f::new(
                        origin.0 + tile_slot_size * (0.5 + column as f32),
                        origin.1 - tile_slot_size * (0.5 + row as f32),
                    ));
                    rs.set_fill_color(sfml::graphics::Color::WHITE);
                    rs.set_outline_color(sfml::graphics::Color::BLACK);
                    rs.set_outline_thickness(outline_thickness);
                    window.draw(&rs);
                }
            }
        }

        fn draw_debug_border(
            &self,
            window: &mut RenderWindow,
            origin: (f32, f32),
            width: f32,
            outline_thickness: f32,
        ) {
            let debug_border_width = width;
            let debug_border_height = width * self.aspect_ratio();
            let mut rs = RectangleShape::new();
            rs.set_size(Vector2f::new(
                debug_border_width,
                debug_border_height,
            ));
            rs.set_origin(Vector2f::new(
                0.0,
                debug_border_height,
            ));
            rs.set_position(Vector2f::new(origin.0, origin.1));
            rs.set_fill_color(sfml::graphics::Color::WHITE);
            rs.set_outline_color(sfml::graphics::Color::RED);
            rs.set_outline_thickness(outline_thickness);
            window.draw(&rs);
        }
    }
}

fn main() {
    println!("Hello, world!");

    let mut game = Game::new();

    let mut window = RenderWindow::new(
        (800, 600),
        "Gravity tiles",
        Style::DEFAULT,
        &Default::default(),
    ).unwrap();
    window.set_framerate_limit(60);

    while window.is_open() {
        while let Some(event) = window.poll_event() {
            match event {

                // Universal event handling.

                Closed => {window.close();}

                Resized {..} => {
                    update_view(&mut window);
                }

                _ => {}
            }
        }

        // Derive the appropriate width and height of the game.

        let window_width = window.size().x as f32;
        let window_height = window.size().y as f32;

        dbg!(window_width);
        dbg!(window_height);

        let game_width = min(
            window_width * 0.8,
            window_height * 0.8 / game.aspect_ratio(),
        );
        let game_height = game_width * game.aspect_ratio();
        let game_x = (window_width - game_width) / 2.0;
        let game_y = window_height - (window_height - game_height) / 2.0;

        // Draw the game.

        window.clear(sfml::graphics::Color::WHITE);
        game.draw_self(&mut window, (game_x, game_y), game_width, true);

        window.set_active(true).expect("could not set window to be active");
        window.display();
    }
}

// Utility function that gives us palatable syntax for getting the
// minimum of two floats.

fn min(a: f32, b: f32) -> f32 {
    a.min(b)
}

// Utility function to update the "view" of the window. Call this
// after a resize event to stop it from getting all stretched out.

fn update_view(win: &mut RenderWindow) {
    let size = win.size();
    win.set_view(
        &View::from_rect(
            FloatRect::new(0.0, 0.0, size.x as f32, size.y as f32)
        ).expect("couldn't create view"));
}
