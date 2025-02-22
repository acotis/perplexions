
use std::hash::{Hash, Hasher, DefaultHasher};
use sfml::graphics::*;
use sfml::cpp::FBox;
use sfml::graphics::Color;

use crate::draw;
use crate::constants;
use crate::dimensions::Dimensions;
use self::GameStage::*;

#[derive(PartialEq, Eq)]
enum GameStage {
    Ongoing,
    Completed(usize),
}

#[derive(Debug, Clone)]
struct Tile {
    letter: char,
    animation_height: f32,
    animation_vel: f32,
}

pub struct Game {
    setup: String,
    field: Vec<Vec<Tile>>,
    select_path: Vec<(usize, usize)>,
    dimensions: Dimensions,
    last_mouse_pos: (f32, f32),
    stage: GameStage,

    // Cached resources.
    font: FBox<Font>,
    color: Color,
    mild_color: Color,
}

// Public non-graphics methods.

impl Game {
    pub fn new<S: AsRef<str>>(setup: S, level_index: usize) -> Self {
        let mut ret = Self {
            setup: String::from(setup.as_ref()),
            field: vec![],
            select_path: vec![],
            dimensions: Dimensions::new(0, 0),
            last_mouse_pos: (0.0, 0.0),
            stage: Ongoing,
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

        ret.color = Color::rgba(r, g, b, 100);
        ret.mild_color = Color::rgba(r, g, b, 50);

        // Set up state from level string.
        
        ret.reset();

        // Set up the initial animation data (only applies to first load).

        for (column, tiles) in ret.field.iter_mut().enumerate() {
            for (row, tile) in tiles.iter_mut().enumerate() {
                tile.animation_height = 12.0 + column as f32 + row as f32;
            }
        }

        ret
    }

    pub fn reset(&mut self) {
        let width = self.setup.lines().map(|l| l.len()).max().unwrap();
        self.field = vec![vec![]; width];

        for line in self.setup.lines().rev() {
            for (column, letter) in line.chars().enumerate() {
                if letter != ' ' {
                    self.field[column].push(Tile {
                        letter,
                        animation_height: 0.0,
                        animation_vel: 0.0,
                    });
                }
            }
        }

        let height = self.field.iter().map(|c| c.len()).max().unwrap();
        self.dimensions = Dimensions::new(width, height);
        self.select_path = vec![];
        self.stage = Ongoing;
    }
}

// Public mouse-handling methods.

impl Game {
    pub fn mouse_down(&mut self, x: f32, y: f32) {
        self.last_mouse_pos = (x, y);
        if let Some((point, _distance)) = self.tile_at_screen_point(x, y) {
            self.select_path.push(point);
        }
    }

    pub fn mouse_moved(&mut self, x: f32, y: f32) {
        self.last_mouse_pos = (x, y);
        if !self.select_path.is_empty() {
            if let Some((point, distance)) = self.tile_at_screen_point(x,y) {
                let last_point = self.select_path[self.select_path.len()-1];
                if distance < 0.4
                && !self.select_path.contains(&point)
                && usize::abs_diff(point.0, last_point.0) <= 1
                && usize::abs_diff(point.1, last_point.1) <= 1 {
                    self.select_path.push(point);
                }
            }
        }
    }

    pub fn mouse_up(&mut self) {

        // Check if selection is a valid word.

        let selected_word_is_valid = constants::is_valid_word(
            self.select_path
                .iter()
                .map(|&(c, r)| self.field[c][r].letter)
                .collect::<String>()
        );

        // If so, perform a deletion.

        if selected_word_is_valid {

            // Set up the animation parameters of the tiles that will fall.

            for (column, tiles) in self.field.iter_mut().enumerate() {
                for (row, tile) in tiles.iter_mut().enumerate() {
                    tile.animation_height =
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
                self.field[column].remove(row);
            }

            // Check if the game is completed.

            if self.field.iter().all(|c| c.is_empty()) {
                self.stage = Completed(100);
            }
        }

        // Reset the selection.

        self.select_path.clear();
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
        for column in &mut self.field {
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
    }

    pub fn draw_self(&self, window: &mut RenderWindow) {

        // Pre-compute some useful values.

        let tile_size         = self.dimensions.tile_size() * 0.8;
        let outline_thickness = self.dimensions.tile_size() * 0.05;
        let select_line_width = self.dimensions.tile_size() * 0.1;
        let character_size    = self.dimensions.tile_size() * 0.5;

        // Set up the Text.

        let mut text = Text::new(&String::new(), &self.font, 0);
        text.set_character_size(character_size as u32);

        // Draw the game tiles.

        for (column, tiles) in self.field.iter().enumerate() {
            for (row, tile) in tiles.iter().enumerate() {
                let (screen_x, screen_y) = self.dimensions.local_to_screen((
                    column as f32,
                    row as f32 + tile.animation_height,
                ));

                // Draw the outline of the tile.

                draw::square(
                    window,
                    (screen_x, screen_y),
                    tile_size,
                    Color::WHITE,
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

        // Draw the selection line.

        let path_points = 
            self.select_path
                .iter()
                .map(|&(x,y)| self.dimensions.local_to_screen((x as f32, y as f32)))
                .chain(std::iter::once(self.last_mouse_pos))
                .collect::<Vec<_>>();

        for item in path_points.windows(2) {
            let &[(x1, y1), (x2, y2)] = item else {panic!()};
            
            draw::circle_plain(
                window,
                (x1, y1),
                select_line_width / 2.0,
                Color::RED
            );

            draw::circle_plain(
                window,
                (x2, y2),
                select_line_width / 2.0,
                Color::RED
            );

            draw::line(
                window,
                (x1, y1),
                (x2, y2),
                Color::RED,
                select_line_width,
            );
        }
    }
}

// Private utility methods.

impl Game {
    fn tile_at_screen_point(&self, x: f32, y: f32) -> Option<((usize, usize), f32)> {
        let (local_c, local_r) = self.dimensions.screen_to_local((x, y));

        let snapped_c = local_c.round();
        let snapped_r = local_r.round();
        let distance = f32::hypot(
            local_c - snapped_c,
            local_r - snapped_r,
        );

        let c = snapped_c as usize;
        let r = snapped_r as usize;

        if 0.0 <= snapped_c && c < self.field.len() {
            if 0.0 <= snapped_r && r < self.field[c].len() {
                return Some(((c, r), distance));
            }
        }

        None
    }
}

