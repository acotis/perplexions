
mod draw;

use sfml::window::*;
use sfml::graphics::*;
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

            // Pre-compute some useful values.

            let tile_slot_size = width / self.field.len() as f32;
            let tile_size = tile_slot_size * 0.8;
            let outline_thickness = tile_slot_size * 0.05;
            let select_line_width = tile_slot_size * 0.1;

            let map_x = |x: f32| origin.0 + tile_slot_size * (0.5 + x);
            let map_y = |y: f32| origin.1 - tile_slot_size * (0.5 + y);

            // Draw the debug border if requested.

            if debug_border {
                self.draw_debug_border(window, origin, width, outline_thickness);
            }

            // Draw the game tiles.

            for (column, tiles) in self.field.iter().enumerate() {
                for (row, tile) in tiles.iter().enumerate() {
                    let center_x = map_x(column as f32);
                    let center_y = map_y(row as f32);

                    draw::square(
                        window,
                        (center_x, center_y),
                        tile_size * 0.5_f32.sqrt(),
                        sfml::graphics::Color::WHITE,
                        outline_thickness,
                        sfml::graphics::Color::BLACK,
                    );
                }
            }

            // Draw the selection line.

            for &(x, y) in self.select_path.iter() {
                let center_x = map_x(x as f32);
                let center_y = map_y(y as f32);

                draw::circle_plain(
                    window,
                    (center_x, center_y),
                    select_line_width / 2.0,
                    sfml::graphics::Color::RED
                );
            }

            for item in self.select_path.windows(2) {
                let &[(x1, y1), (x2, y2)] = item else {panic!()};
                let center_x1 = map_x(x1 as f32);
                let center_y1 = map_y(y1 as f32);
                let center_x2 = map_x(x2 as f32);
                let center_y2 = map_y(y2 as f32);

                draw::line(
                    window,
                    (center_x1, center_y1),
                    (center_x2, center_y2),
                    sfml::graphics::Color::RED,
                    select_line_width,
                );
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
    game.add_to_select_path(0, 0);
    game.add_to_select_path(0, 1);
    game.add_to_select_path(1, 0);

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
                    draw::update_view(&mut window);
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

