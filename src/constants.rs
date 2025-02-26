
#[allow(unused)]
mod production {
    use std::sync::LazyLock;

    // STATIC IMPLEMENTATION: RESTORE WHEN DONE REMOVING WORDS
    // AUTOMATICALLY.

    static WORDS: LazyLock<Vec<String>> = LazyLock::new(|| {
        let mut words = 
            include_str!("words.txt")
                .to_ascii_uppercase()
                .lines()
                .map(str::to_owned)
                .collect::<Vec<String>>();
        words.sort();
        words
    });

    pub fn is_valid_word(word: String) -> bool {
        WORDS.binary_search(&word).is_ok()
    }

    pub fn remove_last_word_tried() { /* do nothing */ }
    pub fn add_last_word_tried() { /* do nothing */ }

    pub fn initialize() {
        LazyLock::force(&WORDS);
    }
}

#[allow(unused)]
mod development {
    use std::sync::Mutex;

    // DYNAMIC IMPLEMENTATION: USE ONLY WHEN TESTING.

    static WORDS: Mutex<Vec<String>> = Mutex::new(vec![]);
    static LAST_WORD_TRIED: Mutex<String> = Mutex::new(String::new());

    pub fn is_valid_word(word: String) -> bool {
        println!("trying word: {word}");
        *LAST_WORD_TRIED.lock().unwrap() = word.clone();
        WORDS.lock().unwrap().binary_search(&word).is_ok()
    }

    fn load_words() {
        let mut lock = WORDS.lock().unwrap();

        lock.clear();
        lock.append(
            &mut std::fs::read_to_string("src/words.txt")
                .expect("couldn't re-open file for re-reading")
                .to_ascii_uppercase()
                .lines()
                .map(str::to_owned)
                .collect::<Vec<String>>()
        );
        lock.sort();
    }

    fn save_words() {
        let lock = WORDS.lock().unwrap();
        std::fs::write(
            "src/words.txt",
            lock.join("\n").to_ascii_lowercase()
        ).expect("couldn't open file for writing");
    }

    pub fn remove_last_word_tried() {
        let last = LAST_WORD_TRIED.lock().unwrap();
        println!("removing the last word: {last}");
        WORDS.lock().unwrap().retain(|word| *word != *last);
        save_words();
    }

    pub fn add_last_word_tried() {
        let last = LAST_WORD_TRIED.lock().unwrap();

        println!("adding the last word: {last}");

        {
            let mut lock = WORDS.lock().unwrap();
            if let Err(pos) = lock.binary_search(&*last) {
                lock.insert(pos, last.clone());
            }
        }
        
        save_words();
    }

    pub fn initialize() {
        load_words();
    }
}

fn parse_levels(level_data: &'static str) -> impl Iterator<Item=String> {
    level_data
        .split("——————————")
        .map(str::to_ascii_uppercase)
        .map(|level|
            level.lines()
                 .map(|line| line.split("#").nth(0).unwrap())
                 .map(str::trim_end)
                 .collect::<Vec<_>>()
                 .join("\n")
        )
        .filter(|split| split.trim() != "")
}

pub fn levels() -> impl Iterator<Item=String> {
    if cfg!(feature="experimental-levels") {
        parse_levels(include_str!("levels_experimental.txt"))
    } else {
        parse_levels(include_str!("levels.txt"))
    }
}

#[cfg(feature="development")] pub use development::*;
#[cfg(feature="production" )] pub use production::*;

