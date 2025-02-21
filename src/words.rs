
use std::sync::LazyLock;
use std::fs::read_to_string;

const WORDS: LazyLock<Vec<String>> = LazyLock::new(|| {
    include_str!("words.txt")
        .lines()
        .map(str::to_owned)
        .collect()
});

pub fn is_valid(word: String) -> bool {
    println!("Validating *{word}*");
    WORDS.binary_search(&word).is_ok()
}

