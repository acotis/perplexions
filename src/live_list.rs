
use std::ops::Deref;
use std::ops::DerefMut;

pub struct LiveList {
    filename: &'static str,
    vec: Vec<String>,
}

impl LiveList {
    pub const fn new(filename: &'static str) -> Self {
        Self {
            filename,
            vec: vec![],
        }
    }

    pub fn save(&self) {
        std::fs::write(
            &self.filename,
            self.vec.join("\n").to_ascii_lowercase()
        ).expect("couldn't open file for writing");
    }

    pub fn load(&mut self) {
        self.vec.clear();
        self.vec.append(
            &mut std::fs::read_to_string(self.filename)
                .expect("couldn't re-open file for re-reading")
                .to_ascii_uppercase()
                .lines()
                .map(str::to_owned)
                .collect::<Vec<String>>()
        );
        self.vec.sort();
    }
}

impl Deref for LiveList {
    type Target = Vec<String>;

    fn deref(&self) -> &Self::Target {
        &self.vec
    }
}

impl DerefMut for LiveList {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.vec
    }
}

