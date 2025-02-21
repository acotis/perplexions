
mod draw;
mod game;
mod dimensions;
mod words;

use sfml::window::*;
use sfml::graphics::*;
use sfml::window::Event::*;
use sfml::window::mouse::Button::*;
use sfml::window::Key::R;

use crate::game::Game;

fn main() {
    println!("Hello, world!");

    let mut game = Game::new(concat!(
        "   G\n",
        "THIS\n",
        "GAME\n",
        "USESRAVITY\n",
    ));

    words::initialize();

    let mut window = RenderWindow::new(
        (800, 600),
        "Perplections",
        Style::DEFAULT,
        &Default::default(),
    ).unwrap();
    window.set_framerate_limit(60);

    'outer: while window.is_open() {
        while let Some(event) = window.poll_event() {
            match event {

                // Universal event handling.

                Closed => {window.close(); break 'outer;}

                MouseButtonPressed {button: Left, x, y} => {
                    game.mouse_down(x as f32, y as f32);
                }

                MouseMoved {x, y} => {
                    game.mouse_moved(x as f32, y as f32);
                }

                MouseButtonReleased {button: Left, ..} => {
                    game.mouse_up();
                }

                KeyPressed {code: R, ..} => {
                    game.reset();
                    set_game_position(&window, &mut game);
                }

                Resized {..} => {
                    draw::update_view(&mut window);
                    set_game_position(&window, &mut game);
                }

                _ => {}
            }
        }

        // Draw the game.

        window.clear(sfml::graphics::Color::WHITE);
        game.tick();
        game.draw_self(&mut window);

        window.set_active(true).expect("could not set window to be active");
        window.display();
    }
}

fn set_game_position(window: &RenderWindow, game: &mut Game) {

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

// Utility function that gives us palatable syntax for getting the
// minimum of two floats.

fn min(a: f32, b: f32) -> f32 {
    a.min(b)
}


