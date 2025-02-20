
use sfml::graphics::*;

use crate::draw;
use crate::dimensions::Dimensions;

struct Tile {}

pub struct Game {
    field: Vec<Vec<Tile>>,
    select_path: Vec<(usize, usize)>,
    dimensions: Dimensions,
}

impl Game {
    // todo: make this private
    pub fn add_to_select_path(&mut self, x: usize, y: usize) {
        self.select_path.push((x, y));
    }

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

        if 0 <= c && c < self.field.len() {
            if 0 <= r && r < self.field[c].len() {
                return Some(((c, r), distance));
            }
        }

        None
    }
}

impl Game {
    pub fn mouse_down(&mut self, x: f32, y: f32) {
        if let Some((point, _distance)) = self.tile_at_screen_point(x, y) {
            self.select_path.push(point);
        }
    }

    pub fn mouse_moved(&mut self, x: f32, y: f32) {
        if !self.select_path.is_empty() {
            if let Some((point, distance)) = self.tile_at_screen_point(x,y) {
                if distance < 0.3 && !self.select_path.contains(&point) {
                    self.select_path.push(point);
                }
            }
        }
    }

    pub fn mouse_up(&mut self) {
        self.select_path.sort();    // Put the selected tile coords in
        self.select_path.reverse(); // reverse order by col, then row.

        for &(column, row) in &self.select_path {
            self.field[column].remove(row);
        }

        self.select_path.clear();
    }
}

// Public non-graphics methods.

impl Game {
    pub fn new() -> Self {
        Self {
            field: vec![
                vec![Tile {}, Tile {}],
                vec![Tile {}],
                vec![Tile {}, Tile {}, Tile {}],
                vec![],
                vec![Tile {}, Tile {}],
            ],
            select_path: vec![],
            dimensions: Dimensions::new(5, 3),
        }
    }
}

// Graphics methods.

impl Game {
    pub fn aspect_ratio(&self) -> f32 {
        self.dimensions.aspect_ratio()
    }

    pub fn set_position(&mut self, origin_x: f32, origin_y: f32, width: f32) {
        self.dimensions.set_position(origin_x, origin_y, width);
    }

    pub fn draw_self(&self, window: &mut RenderWindow) {

        // Pre-compute some useful values.

        let tile_size         = self.dimensions.tile_size() * 0.8;
        let outline_thickness = self.dimensions.tile_size() * 0.05;
        let select_line_width = self.dimensions.tile_size() * 0.1;

        // Draw the game tiles.

        for (column, tiles) in self.field.iter().enumerate() {
            for (row, tile) in tiles.iter().enumerate() {
                draw::square(
                    window,
                    self.dimensions.local_to_screen((
                        column as f32,
                        row as f32,
                    )),
                    tile_size,
                    sfml::graphics::Color::WHITE,
                    outline_thickness,
                    sfml::graphics::Color::BLACK,
                );
            }
        }

        // Draw the selection line.

        for &(x, y) in self.select_path.iter() {
            draw::circle_plain(
                window,
                self.dimensions.local_to_screen((x as f32, y as f32)),
                select_line_width / 2.0,
                sfml::graphics::Color::RED
            );
        }

        for item in self.select_path.windows(2) {
            let &[(x1, y1), (x2, y2)] = item else {panic!()};

            draw::line(
                window,
                self.dimensions.local_to_screen((x1 as f32, y1 as f32)),
                self.dimensions.local_to_screen((x2 as f32, y2 as f32)),
                sfml::graphics::Color::RED,
                select_line_width,
            );
        }
    }
}

