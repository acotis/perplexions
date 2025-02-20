
mod draw;
mod game;
mod dimensions;

use sfml::window::*;
use sfml::graphics::*;
use sfml::window::Event::*;
use sfml::window::mouse::Button::*;

use crate::game::Game;

fn main() {
    println!("Hello, world!");

    let mut game = Game::new();
    game.add_to_select_path(0, 0);
    game.add_to_select_path(0, 1);
    game.add_to_select_path(1, 0);

    let mut window = RenderWindow::new(
        (800, 600),
        "Perplections",
        Style::DEFAULT,
        &Default::default(),
    ).unwrap();
    window.set_framerate_limit(60);

    while window.is_open() {
        while let Some(event) = window.poll_event() {
            match event {

                // Universal event handling.

                Closed => {window.close();}

                MouseButtonPressed {button: Left, x, y} => {
                    game.mouse_down(x as f32, y as f32);
                }

                MouseButtonReleased {button: Left, ..} => {
                    game.mouse_up();
                }

                Resized {..} => {
                    draw::update_view(&mut window);

                    // Derive the appropriate width and height of the game.

                    let window_width = window.size().x as f32;
                    let window_height = window.size().y as f32;

                    let game_width = min(
                        window_width * 0.8,
                        window_height * 0.8 / game.aspect_ratio(),
                    );
                    let game_height = game_width * game.aspect_ratio();
                    let game_x = (window_width - game_width) / 2.0;
                    let game_y = window_height - (window_height - game_height) / 2.0;

                    game.set_position(game_x, game_y, game_width);
                }

                _ => {}
            }
        }

        // Draw the game.

        window.clear(sfml::graphics::Color::WHITE);
        game.draw_self(&mut window);

        window.set_active(true).expect("could not set window to be active");
        window.display();
    }
}

// Utility function that gives us palatable syntax for getting the
// minimum of two floats.

fn min(a: f32, b: f32) -> f32 {
    a.min(b)
}

