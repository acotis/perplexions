
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
    use crate::live_list::LiveList;
    use std::sync::Mutex;

    // DYNAMIC IMPLEMENTATION: USE ONLY WHEN TESTING.

    static WORDS: Mutex<LiveList> = Mutex::new(LiveList::new("src/words.txt"));
    static LAST_WORD_TRIED: Mutex<String> = Mutex::new(String::new());

    pub fn is_valid_word(word: String) -> bool {
        //println!("trying word: {word}");
        *LAST_WORD_TRIED.lock().unwrap() = word.clone();
        WORDS.lock().unwrap().binary_search(&word).is_ok()
    }

    pub fn starts_valid_word(word: String) -> bool {
        let lock = WORDS.lock().unwrap();

        match lock.binary_search(&word) {
            Ok (pos) => lock.get(pos + 1).is_some_and(|w| w.starts_with(&word)),
            Err(pos) => lock.get(pos    ).is_some_and(|w| w.starts_with(&word)),
        }
    }

    pub fn load_words() {
        WORDS.lock().unwrap().load()
    }

    pub fn save_words() {
        WORDS.lock().unwrap().save()
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
    #[cfg(    feature="experimental-levels") ] {parse_levels(include_str!("levels_experimental.txt"))}
    #[cfg(not(feature="experimental-levels"))] {parse_levels(include_str!("levels.txt"))}
}

#[cfg(    feature="development") ] pub use development::*;
#[cfg(not(feature="development"))] pub use production::*;

