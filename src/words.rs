
use std::sync::LazyLock;

static WORDS: LazyLock<Vec<String>> = LazyLock::new(|| {
    let mut words = 
        include_str!("words.txt")
            .lines()
            .map(str::to_owned)
            .collect::<Vec<String>>();
    words.sort();
    words
});

pub fn is_valid(word: String) -> bool {
    WORDS.binary_search(&word).is_ok()
}

pub fn initialize() {
    is_valid(String::new());
}

