
use sfml::graphics::*;

use crate::draw;

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
}

// Graphics methods.

impl Game {
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
            let debug_border_width = width;
            let debug_border_height = width * self.aspect_ratio();
            let debug_border_center_x = origin.0 + debug_border_width * 0.5;
            let debug_border_center_y = origin.1 - debug_border_height * 0.5;

            draw::rectangle(
                window,
                (debug_border_center_x, debug_border_center_y),
                debug_border_width,
                debug_border_height,
                sfml::graphics::Color::WHITE,
                outline_thickness,
                sfml::graphics::Color::RED,
            );
        }

        // Draw the game tiles.

        for (column, tiles) in self.field.iter().enumerate() {
            for (row, tile) in tiles.iter().enumerate() {
                let center_x = map_x(column as f32);
                let center_y = map_y(row as f32);

                draw::square(
                    window,
                    (center_x, center_y),
                    tile_size,
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
}

