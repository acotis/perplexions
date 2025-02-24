
mod draw;
mod game;
mod dimensions;
mod constants;

use sfml::window::*;
use sfml::graphics::*;
use sfml::window::Event::*;
use sfml::window::mouse::Button::*;
use sfml::window::Key::{A, R, U, Q, X};

use crate::game::Game;

struct Explosion {
    big: bool,
    color: Color,
    age: usize,

    x: f32,
    y: f32,
}

fn main() {

    // Initialize stuff.

    constants::initialize();
    let mut levels = constants::levels().enumerate().peekable();
    let (id, level) = levels.next().unwrap();
    let mut game = Game::new(level, id, false);
    let mut explosions: Vec<Explosion> = vec![];

    // Create the SFML window.

    let mut window = RenderWindow::new(
        (800, 600),
        "Perplections",
        Style::DEFAULT,
        &Default::default(),
    ).unwrap();

    window.set_framerate_limit(60);

    // Game loop.

    'outer: while window.is_open() {

        // Handle events.

        while let Some(event) = window.poll_event() {
            match event {
                Closed => {window.close(); break 'outer;}

                MouseButtonPressed {button: Left, x, y} => {
                    game.mouse_down(x as f32, y as f32);
                }

                MouseMoved {x, y} => {
                    game.mouse_moved(x as f32, y as f32);
                }

                MouseButtonReleased {button: Left, ..} => {
                    if let Some((color, big, x, y)) = game.mouse_up() {
                        explosions.push(Explosion {
                            big: big,
                            color: color,
                            age: 0,
                            x: x,
                            y: y,
                        });
                    }
                }

                KeyPressed {code: X, ..} => {
                    constants::remove_last_word_tried();
                }
                
                KeyPressed {code: A, ..} => {
                    constants::add_last_word_tried();
                }
                
                KeyPressed {code: R, ..} => {
                    game.reset();
                    set_game_position(&window, &mut game);
                }
                
                KeyPressed {code: U, ..} |
                MouseButtonPressed {button: Right, ..} => {
                    game.undo();
                    set_game_position(&window, &mut game);
                }

                KeyPressed {code: Q, ..} => {
                    if levels.peek() == None {
                        window.close();
                    }
                }

                Resized {..} => {
                    draw::update_view(&mut window);
                    set_game_position(&window, &mut game);
                }

                _ => {}
            }
        }

        // Clear the window.

        window.clear(sfml::graphics::Color::WHITE);

        // Tick the explosions and draw them.

        for e in &mut explosions {
            let radius = if e.big {
                e.age as f32 * 20.0
            } else {
                e.age as f32 * 20.0
            };

            let opacity = if e.big {
                (0.95_f32.powf(e.age as f32) * 255.0) * 
                    if e.age > 40 {0.95_f32.powf((e.age - 40) as f32)} else {1.0}
            } else {
                //255.0 - (e.age as f32 * 20.0)
                0.0
            } as u8;

            draw::circle_plain(&mut window, (e.x, e.y), radius, 
                Color::rgba(e.color.r, e.color.g, e.color.b, opacity as u8));

            e.age += 1;
        }

        explosions.retain(|e| e.age < 10000);

        // Tick the game logic and draw the game.

        game.tick();
        game.draw_self(&mut window);

        // "Display".

        window.display();

        // If the game is completed, load the next one.

        if game.is_completed() {
            if let Some((id, level)) = levels.next() {
                game = Game::new(level, id, levels.peek() == None);
                set_game_position(&window, &mut game);
            } else {
                window.close();
            }
        }
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

