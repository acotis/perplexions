
use std::sync::LazyLock;

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

