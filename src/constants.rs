
use std::sync::LazyLock;
use std::sync::Mutex;

/*
// STATIC IMPLEMENTATION: RESTORE WHEN DONE REMOVING WORDS AUTOMATICALLY.

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

pub fn initialize() {
    LazyLock::force(&WORDS);
}
*/

static WORDS: Mutex<Vec<String>> = Mutex::new(vec![]);

static LAST_WORD_TRIED: Mutex<String> = Mutex::new(String::new());

pub fn is_valid_word(word: String) -> bool {
    WORDS.lock().unwrap().binary_search(&word).is_ok()
}

pub fn remove_last_word_tried() {
    let last = LAST_WORD_TRIED.lock().unwrap();
    std::fs::write(
        "src/words.txt",
        std::fs::read_to_string("src/words.txt")
            .expect("couldn't open file for reading")
            .lines()
            .filter(|x| x.to_ascii_uppercase() != *last)
            .collect::<Vec<_>>()
            .join("\n")
    ).expect("couldn't open file for writing");

    WORDS.lock().unwrap().clear();
    WORDS.lock().unwrap().append(
        &mut std::fs::read_to_string("src/words.txt")
            .expect("couldn't re-open file for re-reading")
            .to_ascii_uppercase()
            .lines()
            .map(str::to_owned)
            .collect::<Vec<String>>()
    );
    WORDS.lock().unwrap().sort();
}

pub fn levels() -> impl Iterator<Item=String> {
    include_str!("levels.txt")
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

pub fn initialize() {
    remove_last_word_tried();
}
