
mod constants;
mod live_list;

use std::fmt;
use std::fmt::Display;
use std::collections::HashSet;
use std::io::{stdin,stdout,Write};
use crate::live_list::LiveList;

const GREEN: &'static str = "\x1b[32m";
const GREY : &'static str = "\x1b[38;5;242m";
const CYAN : &'static str = "\x1b[38;5;51m";
const BOLD : &'static str = "\x1b[1m";
const RESET: &'static str = "\x1b[0m";

struct LevelSolver {
    fields: Vec<Vec<Vec<char>>>,
}

impl LevelSolver {
    fn new<S: AsRef<str>>(level_data: S) -> Self {
        let width = level_data.as_ref().lines().map(|l| l.len()).max().unwrap();
        let mut starting_position = vec![vec![]; width];

        for line in level_data.as_ref().lines().rev() {
            for (column, letter) in line.chars().enumerate() {
                if letter != ' ' {
                    starting_position[column].push(letter);
                }
            }
        }

        Self {
            fields: vec![starting_position],
        }
    }

    fn move_unchecked(&mut self, path: &[(usize, usize)]) {
        let mut path = path.to_vec();
        path.sort();
        path.reverse();

        self.fields.insert(0, self.fields[0].clone());

        for (column, row) in path {
            self.fields[0][column].remove(row);
        }
    }

    fn undo(&mut self) {
        self.fields.remove(0);
    }

    fn word_at(&self, path: &[(usize, usize)]) -> String {
        path.iter()
            .map(|&(col, row)| self.fields[0][col][row])
            .collect()
    }

    fn all_moves(&self) -> Vec<Vec<(usize, usize)>> {
        let mut ret = vec![];
        let mut partials = vec![];

        // Add all starters.

        for col in 0..self.fields[0].len() {
            for row in 0..self.fields[0][col].len() {
                partials.push(vec![(col, row)]);
            }
        }

        // Compute all valid moves by iteratively extending
        // <partials> and saving the ones that are valid
        // words as they stand.

        while partials.len() > 0 {
            
            // For any partial that is a word as it stands,
            // collect it into <ret>.

            for partial in &partials {
                if constants::is_valid_word(self.word_at(partial)) {
                    ret.push(partial.clone());
                }
            }

            // For any partial that could in theory be
            // extended into a word, extend it in all
            // possible ways and push those to the next
            // round of partials.

            let mut next_partials = vec![];

            for partial in &partials {
                if constants::starts_valid_word(self.word_at(partial)) {
                    for delta_col in [!0, 0, 1] {
                        for delta_row in [!0, 0, 1] {
                            let next = (
                                partial[partial.len()-1].0 + delta_col,
                                partial[partial.len()-1].1 + delta_row
                            );

                            if delta_col == 0 && delta_row == 0 {continue;}
                            if next.0 >= self.fields[0].len() {continue;}
                            if next.1 >= self.fields[0][next.0].len() {continue;}
                            if partial.contains(&next) {continue;}

                            let mut extended = partial.clone();
                            extended.push(next);

                            next_partials.push(extended);
                        }
                    }
                }
            }

            partials = next_partials;
        }

        ret
    }

    fn explore(&mut self, seen: &mut HashSet<String>, blessed: &mut LiveList, context: &mut Vec<String>) {
        // short circuit
        if context.len() > 2 {return;}

        let context_str = context.join(" ");

        if self.fields[0].iter().all(|col| col.is_empty()) {
            println!("{BOLD}{GREEN}[{context_str}]{RESET} is a solution");
        }

        let display = format!("{self}");
        if seen.contains(&display) {
            return;
        } else {
            seen.insert(display.clone());
        }

        for mv in self.all_moves() {
            let word = self.word_at(&mv);

            if check_okay(blessed, &context_str, &word) {
                context.push(word);
                self.move_unchecked(&mv);
                self.explore(seen, blessed, context);
                self.undo();
                context.pop();
            }
        }
    }
}

impl Display for LevelSolver {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let height = self.fields[0].iter().map(|col| col.len()).max().unwrap();
        for row in (0..height).rev() {
            for col in &self.fields[0] {
                write!(f, "{}", col.get(row).unwrap_or(&' '))?;
            }
            write!(f, "\n")?;
        }

        Ok(())
    }
}

fn main() {
    constants::initialize();

    for level in constants::levels().skip(9) {
        let mut solver = LevelSolver::new(level);
        let mut blessed = LiveList::new("src/blessed_words.txt");

        println!();

        blessed.load();
        solver.explore(&mut HashSet::new(), &mut blessed, &mut vec![]);
    }

    println!();
}

fn check_okay(blessed: &mut LiveList, context: &str, word: &str) -> bool {
    if !constants::is_valid_word(String::from(word)) {
        return false;
    }

    match blessed.binary_search(&String::from(word)) {
        Ok(_) => true,
        Err(pos) => {
            if prompt_user(context, word) {
                blessed.insert(pos, String::from(word));
                blessed.save();
                true
            } else {
                constants::remove_last_word_tried();
                false
            }
        }
    }
}

fn prompt_user(context: &str, word: &str) -> bool {
    let mut input = String::new();
    while !["x\n", "a\n"].contains(&&*input) {
        input = String::new();
        print!("{GREY}[{context}]{RESET} {BOLD}{word}{RESET} {CYAN}");
        stdout().flush().expect("could not flush");
        stdin().read_line(&mut input).expect("did not enter a correct string");
        print!("{RESET}");
        stdout().flush().expect("could not flush second time");

        if input == "w\n" {
            std::process::Command::new("firefox")
                .arg(format!("https://en.wiktionary.org/wiki/{}", word.to_ascii_lowercase()))
                .output()
                .expect("failed to execute process");
        }
    }
    input == "a\n"
}

