
use std::sync::LazyLock;

const WORDS: LazyLock<Vec<String>> = LazyLock::new(|| {
    include_str!("words.txt")
        .lines()
        .map(str::to_owned)
        .collect()
});

pub fn is_valid(word: String) -> bool {
    WORDS.binary_search(&word).is_ok()
}

