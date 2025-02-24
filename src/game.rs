
use std::hash::{Hash, Hasher, DefaultHasher};
use sfml::graphics::*;
use sfml::cpp::FBox;
use sfml::graphics::Color;

use crate::draw;
use crate::constants;
use crate::dimensions::Dimensions;
use self::GameStage::*;
use self::Opacity::*;

#[derive(PartialEq, Eq)]
enum GameStage {
    Ongoing,
    Completed(usize),
}

enum Opacity {
    Off,
    OffButWasOn,
    On(u8),
}

#[derive(Debug, Clone)]
struct Tile {
    letter: char,
    animation_height: f32,
    animation_vel: f32,
}

pub struct Game {
    fields: Vec<Vec<Vec<Tile>>>,
    select_path: Vec<(usize, usize)>,
    dimensions: Dimensions,
    last_mouse_pos: (f32, f32),
    stage: GameStage,
    restart_opacity: Opacity,
    level_index: usize,
    last_level: bool,

    // Cached resources.
    font: FBox<Font>,
    color: Color,
    mild_color: Color,
}

// Public non-graphics methods.

impl Game {
    pub fn new<S: AsRef<str>>(setup: S, level_index: usize, last_level: bool) -> Self {
        let mut ret = Self {
            fields: vec![],
            select_path: vec![],
            dimensions: Dimensions::new(0, 0),
            last_mouse_pos: (0.0, 0.0),
            stage: Ongoing,
            restart_opacity: if last_level {On(0)} else {Off},
            level_index: level_index,
            last_level: last_level,
            color: Color::BLACK,
            mild_color: Color::BLACK,
            font: Font::from_file("/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf").expect("couldn't load Arial font"),
        };

        // Create the real value of the color.

        let mut hasher = DefaultHasher::new();
        level_index.hash(&mut hasher);
        let hash: u64 = hasher.finish();

        let r = (hash       & 255) as u8;
        let g = (hash >> 8  & 255) as u8;
        let b = (hash >> 16 & 255) as u8;

        ret.color      = Color::rgb(r/5*2+150,g/5*2+150,b/5*2+150);
        ret.mild_color = Color::rgb(r/5*1+200,g/5*1+200,b/5*1+200);

        // Set up state from level string.
        
        let width = setup.as_ref().lines().map(|l| l.len()).max().unwrap();
        ret.fields = vec![vec![vec![]; width]];

        for line in setup.as_ref().lines().rev() {
            for (column, letter) in line.chars().enumerate() {
                if letter != ' ' {
                    ret.fields[0][column].push(Tile {
                        letter,
                        animation_height: 0.0,
                        animation_vel: 0.0,
                    });
                }
            }
        }

        let height = ret.fields[0].iter().map(|c| c.len()).max().unwrap();
        ret.dimensions = Dimensions::new(width, height);

        // Set up the initial animation data (only applies to first load).

        for (column, tiles) in ret.fields[0].iter_mut().enumerate() {
            for (row, tile) in tiles.iter_mut().enumerate() {
                tile.animation_height = 12.0 + column as f32 + row as f32;
            }
        }

        ret
    }

    pub fn reset(&mut self) {
        if self.stage == Ongoing {
            while self.fields.len() > 1 {
                self.undo();
            }
        }
    }

    pub fn undo(&mut self) {
        if self.stage == Ongoing {
            if self.fields.len() > 1 {
                self.fields.remove(0);
                self.select_path = vec![];
                if self.fields.len() == 1 {self.restart_opacity = OffButWasOn;}
            }
        }
    }
}

// Public mouse-handling methods.

impl Game {
    pub fn mouse_down(&mut self, x: f32, y: f32) {
        if self.last_level {return;}

        self.last_mouse_pos = (x, y);
        if let Some((point, _distance)) = self.tile_at_screen_point(x, y) {
            self.select_path.push(point);
        }
    }

    pub fn mouse_moved(&mut self, x: f32, y: f32) {
        self.last_mouse_pos = (x, y);
        if !self.select_path.is_empty() {
            if let Some((point, distance)) = self.tile_at_screen_point(x, y) {
                let last_point = self.select_path[self.select_path.len()-1];

                // If the mouse is close enough to the touched point,
                // add it to the selection path.

                if distance < 0.4
                && !self.select_path.contains(&point)
                && usize::abs_diff(point.0, last_point.0) <= 1
                && usize::abs_diff(point.1, last_point.1) <= 1 {
                    self.select_path.push(point);
                }

                // If the mouse is on the previously selected tile,
                // remove the last tile.

                if self.select_path.len() >=2
                && self.select_path[self.select_path.len()-2] == point
                && distance < 0.4 {
                    self.select_path.pop();
                }
            }
        }
    }

    pub fn mouse_up(&mut self) -> Option<(Color, bool, f32, f32)> {

        // If selection path is empty, return.
        
        if self.select_path.is_empty() {return None;}

        // If there is a tile under the mouse and it is a valid tile
        // to add, add it to the selection path even if the mouse is
        // too far away by the normal distance standard.

        let (x, y) = self.last_mouse_pos;
        if let Some((point, _)) = self.tile_at_screen_point(x, y) {
            let last_point = self.select_path[self.select_path.len()-1];

            if !self.select_path.contains(&point)
            && usize::abs_diff(point.0, last_point.0) <= 1
            && usize::abs_diff(point.1, last_point.1) <= 1 {
                self.select_path.push(point);
            }
        }

        // Check if selection is a valid word.

        let selected_word_is_valid = constants::is_valid_word(
            self.select_path
                .iter()
                .map(|&(c, r)| self.fields[0][c][r].letter)
                .collect::<String>()
        );

        // If so, push a new field state and perform a deletion.

        if selected_word_is_valid {
            self.push_field_state();

            // Save the locus of the explosion.

            let explosion_center = self.dimensions.local_to_screen((
                self.select_path[self.select_path.len()-1].0 as f32,
                self.select_path[self.select_path.len()-1].1 as f32,
            ));

            // Set up the animation parameters of the tiles that will fall.

            for (column, tiles) in self.fields[0].iter_mut().enumerate() {
                for (row, tile) in tiles.iter_mut().enumerate() {
                    tile.animation_height +=
                        self.select_path
                            .iter()
                            .filter(|&&(c, r)| c == column && r < row)
                            .count()
                        as f32;
                }
            }

            // Delete the selected tiles.

            self.select_path.sort();
            self.select_path.reverse();

            for &(column, row) in &self.select_path {
                self.fields[0][column].remove(row);
            }

            // Set the restart button to fade in.

            self.restart_opacity = match self.restart_opacity {
                Off => if self.level_index == 0 {On(0)} else {On(255)},
                OffButWasOn => On(255),
                On(x) => On(x), // should never happen
            };

            // Check if the game is completed.

            if self.fields[0].iter().all(|c| c.is_empty()) {
                self.stage = Completed(125);
            }

            // Reset the selection and return a circle.

            self.select_path.clear();
            return Some((
                self.color,
                self.stage != Ongoing,
                explosion_center.0,
                explosion_center.1,
            ));
        }

        // Reset the selection.

        self.select_path.clear();
        None
    }
}

// Public graphics methods.

impl Game {
    pub fn aspect_ratio(&self) -> f32 {
        self.dimensions.aspect_ratio()
    }

    pub fn set_position(&mut self, origin_x: f32, origin_y: f32, width: f32) {
        self.dimensions.set_position(origin_x, origin_y, width);
    }

    pub fn is_completed(&self) -> bool {
        self.stage == Completed(0)
    }

    pub fn tick(&mut self) {
        for column in &mut self.fields[0] {
            for tile in column {
                tile.animation_vel += 0.015;

                if tile.animation_vel > 0.4 {
                    tile.animation_vel = 0.4;
                }

                tile.animation_height -= tile.animation_vel;

                if tile.animation_height < 0.0 {
                    tile.animation_height = 0.0;
                    tile.animation_vel = 0.0;
                }
            }
        }

        if let Completed(n) = self.stage {
            let new_value = if n == 0 {0} else {n-1};
            self.stage = Completed(new_value);
        }

        self.restart_opacity = match self.restart_opacity {
            Off => Off,
            OffButWasOn => if self.level_index == 0 {Off} else {OffButWasOn},
            On(n) => On(if n < 255 {n+1} else {n}),
        };
    }

    pub fn draw_self(&self, window: &mut RenderWindow) {

        // Pre-compute some useful values.

        let tile_size         = self.dimensions.tile_size() * 0.8;
        let outline_thickness = self.dimensions.tile_size() * 0.05;
        let select_line_width = self.dimensions.tile_size() * 0.4;
        let character_size    = self.dimensions.tile_size() * 0.5;
        let stretch_radius    = self.dimensions.tile_size() * 0.8;
        let restart_text_size = self.dimensions.tile_size() * 0.3;

        // Set up the Text.

        let mut text = Text::new(&String::new(), &self.font, 0);
        text.set_character_size(character_size as u32);

        // Draw the selection line (it goes under the tiles).

        let mut path_points = 
            self.select_path
                .iter()
                .map(|&(x,y)| self.dimensions.local_to_screen((x as f32, y as f32 + self.fields[0][x][y].animation_height)))
                .collect::<Vec<_>>();

        if path_points.len() > 0 {
            let last = path_points[path_points.len()-1];
            let (mouse_x, mouse_y) = self.last_mouse_pos;
            let angle    = f32::atan2(mouse_y - last.1, mouse_x - last.0);
            let distance = f32::hypot(mouse_y - last.1, mouse_x - last.0);
            let shorter  = if distance > stretch_radius {stretch_radius} else {distance};
            let new_x    = last.0 + shorter * angle.cos();
            let new_y    = last.1 + shorter * angle.sin();
            path_points.push((new_x, new_y));
        }

        for item in path_points.windows(2) {
            let &[(x1, y1), (x2, y2)] = item else {panic!()};
            
            draw::circle_plain(
                window,
                (x1, y1),
                select_line_width / 2.0,
                self.color,
            );

            draw::circle_plain(
                window,
                (x2, y2),
                select_line_width / 2.0,
                self.color,
            );

            draw::line(
                window,
                (x1, y1),
                (x2, y2),
                self.color,
                select_line_width,
            );
        }

        // Draw the game tiles.

        for (column, tiles) in self.fields[0].iter().enumerate() {
            for (row, tile) in tiles.iter().enumerate() {
                let (screen_x, screen_y) = self.dimensions.local_to_screen((
                    column as f32,
                    row as f32 + tile.animation_height,
                ));

                // Compute the fill color (highlight level).

                let fill_color = 
                    if self.select_path.contains(&(column, row))
                    || self.tile_at_screen_point(self.last_mouse_pos.0, self.last_mouse_pos.1).map(|((c, r), _)|(c,r)) == Some((column, row))
                    || self.last_level {
                        self.color
                    } else {
                        Color::WHITE
                    };

                // Draw the tile itself.

                draw::square(
                    window,
                    (screen_x, screen_y),
                    tile_size,
                    fill_color,
                    outline_thickness,
                    self.color,
                );

                // Draw the letter on the tile.

                let glyph = self.font.glyph(
                    tile.letter as u32,
                    character_size as u32,
                    false,
                    0.0
                );

                text.set_string(&String::from(tile.letter));
                text.set_origin(sfml::system::Vector2f::new(
                    glyph.advance() / 2.0,
                    character_size * 0.6,
                ));
                text.set_position(sfml::system::Vector2f::new(screen_x, screen_y));
                text.set_fill_color(Color::BLACK);
                window.draw(&text);
            }
        }

        // Draw the restart and undo texts.

        //let undo_string    = "U: undo";
        //let restart_string = "R: restart";
        let restart_string = if self.last_level {
            "Q = quit"
        } else {
            "U = undo,  R = restart"
        };

        /*
        let undo_center = self.dimensions.local_to_screen((
            (self.fields[0].len() as f32) * 0.35 - 0.5,
            -0.75,
        ));
        */

        let restart_center = self.dimensions.local_to_screen((
            (self.fields[0].len() as f32) * 0.50 - 0.5,
            -0.80,
        ));

        let restart_opacity = match self.restart_opacity {
            Off => 0,
            OffButWasOn => 0,
            On(n) => if self.stage == Ongoing {
                if n < 128 {0} else {n - 128}
            } else {
                0
            }
        };

        text.set_character_size(restart_text_size as u32);
        text.set_string(restart_string);
        text.set_origin(sfml::system::Vector2f::new(
            restart_string.chars().map(|c| self.font.glyph(c as u32, restart_text_size as u32, false, 0.0).advance()).sum::<f32>() * 0.5,
            restart_text_size * 0.6
        ));
        text.set_position(sfml::system::Vector2f::new(restart_center.0, restart_center.1));
        text.set_fill_color(Color::rgba(0, 0, 0, restart_opacity));
        window.draw(&text);

        /*
        text.set_character_size(restart_text_size as u32);
        text.set_string(undo_string);
        text.set_origin(sfml::system::Vector2f::new(
            undo_string.chars().map(|c| self.font.glyph(c as u32, restart_text_size as u32, false, 0.0).advance()).sum::<f32>() * 0.5,
            restart_text_size * 0.6
        ));
        text.set_position(sfml::system::Vector2f::new(undo_center.0, undo_center.1));
        text.set_fill_color(Color::rgba(0, 0, 0, restart_opacity));
        window.draw(&text);
        */

        /*
        let undo_size = (
            self.dimensions.tile_size() * self.fields[0].len() as f32 * 0.5 * 0.95,
            self.dimensions.tile_size() * 0.5 * 0.8,
        );

        if (self.last_mouse_pos.0 - undo_center.0).abs() < undo_size.0 / 2.0
        && (self.last_mouse_pos.1 - undo_center.1).abs() < undo_size.1 / 2.0 {
            draw::rectangle_plain(
                window,
                undo_center,
                undo_size.0,
                undo_size.1,
                Color::rgba(0, 0, 0, 45),
            );
        }
        */
    }
}

// Private utility methods.

impl Game {
    fn tile_at_screen_point(&self, x: f32, y: f32) -> Option<((usize, usize), f32)> {
        let (local_c, local_r) = self.dimensions.screen_to_local((x, y));

        for (column, tiles) in self.fields[0].iter().enumerate() {
            for (row, tile) in tiles.iter().enumerate() {
                let tile_c = column as f32;
                let tile_r = row as f32 + tile.animation_height;

                let distance_c = (local_c - tile_c).abs();
                let distance_r = (local_r - tile_r).abs();

                if distance_c < 0.5 && distance_r < 0.5 {
                    let distance = f32::hypot(
                        local_c - tile_c,
                        local_r - tile_r,
                    );

                    return Some(((column, row), distance));
                }
            }
        }

        None
    }

    fn push_field_state(&mut self) {
        self.fields.insert(0, self.fields[0].clone());

        // Set the animation heights of all tiles in the previous
        // field state to 0 so that, when the player resets to
        // that state, tiles don't jump up into the air and start
        // falling, even if they were in the air and falling when
        // this state was pushed.

        for tiles in &mut self.fields[1] {
            for tile in tiles {
                tile.animation_height = 0.0;
            }
        }
    }
}

