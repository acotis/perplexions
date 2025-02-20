
#[derive(Debug)]
pub struct Dimensions {
    columns: usize, // Prime properties.
    rows: usize,
    origin_x: f32,
    origin_y: f32,
    width: f32,

    height: f32,    // Derived properties.
    tile_size: f32,
    aspect_ratio: f32,
}

impl Dimensions {
    pub fn new(columns: usize, rows: usize) -> Self {
        let mut ret = Self {
            columns:        columns,
            rows:           rows,
            origin_x:       0.0,
            origin_y:       0.0,
            width:          0.0,
            height:         0.0,
            tile_size:      0.0,
            aspect_ratio:   0.0,
        };
        
        ret.set_position(0.0, 0.0, 1.0);
        ret
    }

    pub fn set_position(&mut self, origin_x: f32, origin_y: f32, width: f32) {
        self.origin_x = origin_x;
        self.origin_y = origin_y;
        self.width = width;
        self.height = self.width * self.aspect_ratio();
        self.tile_size = self.width / self.columns as f32;
        self.aspect_ratio = self.rows as f32 / self.columns as f32;
    }

    pub fn aspect_ratio(&self) -> f32 {
        self.aspect_ratio
    }

    pub fn tile_size(&self) -> f32 {
        self.tile_size
    }

    pub fn screen_to_local(&self, (x, y): (f32, f32)) -> (f32, f32) {
        (
            (x - self.origin_x) / self.tile_size - 0.5,
           -(y - self.origin_y) / self.tile_size - 0.5,
        )
    }

    pub fn local_to_screen(&self, (x, y): (f32, f32)) -> (f32, f32) {
        (
            self.origin_x + self.tile_size * (x + 0.5),
            self.origin_y - self.tile_size * (y + 0.5),
        )
    }
}

