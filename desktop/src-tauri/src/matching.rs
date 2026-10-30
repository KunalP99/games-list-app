//! Matching an executable name to a game title.
//!
//! Used in both directions: when the app asks "is this your game?" it should
//! name the likeliest game rather than whichever happened to be first, and
//! when the user picks a game to link, the likeliest running program should
//! already be selected.
//!
//! Everything here is pure, so the interesting cases — real titles from real
//! libraries — are covered by tests rather than by hoping.

/// Tokens that say nothing about which game an executable belongs to.
/// `ShooterGame-Win64-Shipping.exe` is every Unreal game ever made.
const NOISE: &[&str] = &[
    "win64", "win32", "shipping", "x64", "x86", "launcher", "retail", "release",
    "final", "steam", "epic", "client", "app", "exe", "bin", "play", "start", "run",
];

/// Executables so generic that guessing from them is worse than not guessing.
const GENERIC: &[&str] = &["game", "shootergame", "main", "application", "program", "setup", "launch"];

/// Words that are not worth an initial when abbreviating a title.
const STOPWORDS: &[&str] = &["the", "of", "a", "an", "and", "at", "in", "on", "to", "for"];

/// Above this, a guess is worth putting in front of someone.
pub const CONFIDENT: u32 = 55;

/// Split on separators and camelCase, lowercase, and drop noise.
///
/// "SplitFiction.exe" and "split_fiction-Win64-Shipping.exe" both become
/// ["split", "fiction"].
fn tokens(raw: &str) -> Vec<String> {
    let stem = raw.strip_suffix(".exe").unwrap_or(raw);
    let mut parts: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut prev_lower = false;

    for ch in stem.chars() {
        // Apostrophes are skipped rather than treated as separators: "Baldur's"
        // is one word, and splitting it would abbreviate "Baldur's Gate III" to
        // "bsg3" instead of the "bg3" its executable actually uses.
        if ch == '\'' || ch == '\u{2019}' {
            continue;
        }
        if ch.is_alphanumeric() {
            // A capital after a lowercase starts a new word: "SplitFiction".
            if ch.is_uppercase() && prev_lower && !current.is_empty() {
                parts.push(std::mem::take(&mut current));
            }
            current.push(ch.to_ascii_lowercase());
            prev_lower = ch.is_lowercase() || ch.is_numeric();
        } else if !current.is_empty() {
            parts.push(std::mem::take(&mut current));
            prev_lower = false;
        }
    }
    if !current.is_empty() {
        parts.push(current);
    }

    parts.into_iter().filter(|p| !NOISE.contains(&p.as_str())).collect()
}

/// Roman numerals a game title might use, where the executable would use the
/// digit: "Baldur's Gate III" against "bg3.exe".
///
/// Deliberately excludes bare "x": "Mega Man X" is a name, not a ten.
fn roman_to_digit(token: &str) -> Option<&'static str> {
    match token {
        "ii" => Some("2"),
        "iii" => Some("3"),
        "iv" => Some("4"),
        "v" => Some("5"),
        "vi" => Some("6"),
        "vii" => Some("7"),
        "viii" => Some("8"),
        "ix" => Some("9"),
        _ => None,
    }
}

/// The title with any Roman numerals turned into digits, when that changes it.
///
/// Returned as an *alternative* rather than a replacement, because "V Rising"
/// is a V that means V, and its executable says so.
fn digit_variant(title_tokens: &[String]) -> Option<String> {
    let mut changed = false;
    let converted: String = title_tokens
        .iter()
        .map(|t| match roman_to_digit(t) {
            Some(digit) => {
                changed = true;
                digit.to_string()
            }
            None => t.clone(),
        })
        .collect();
    changed.then_some(converted)
}

/// How a person would abbreviate the title: "Baldur's Gate III" -> "bg3",
/// "Red Dead Redemption 2" -> "rdr2".
fn acronym(title_tokens: &[String]) -> String {
    let mut out = String::new();
    for token in title_tokens {
        if STOPWORDS.contains(&token.as_str()) {
            continue;
        }
        if token.chars().all(|c| c.is_numeric()) {
            out.push_str(token); // years and sequel numbers survive whole
        } else if let Some(digit) = roman_to_digit(token) {
            out.push_str(digit);
        } else if let Some(first) = token.chars().next() {
            out.push(first);
        }
    }
    out
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() {
        return b.len();
    }
    if b.is_empty() {
        return a.len();
    }

    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut current = vec![0usize; b.len() + 1];

    for (i, ca) in a.iter().enumerate() {
        current[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let cost = if ca == cb { 0 } else { 1 };
            current[j + 1] = (prev[j] + cost).min(prev[j + 1] + 1).min(current[j] + 1);
        }
        std::mem::swap(&mut prev, &mut current);
    }
    prev[b.len()]
}

fn similarity(a: &str, b: &str) -> u32 {
    let longest = a.chars().count().max(b.chars().count());
    if longest == 0 {
        return 0;
    }
    let distance = levenshtein(a, b);
    let ratio = 1.0 - (distance as f64 / longest as f64);
    (ratio.max(0.0) * 100.0) as u32
}

/// How well an executable name matches a game title, 0–100.
pub fn score(exe_name: &str, title: &str) -> u32 {
    let exe_tokens = tokens(exe_name);
    if exe_tokens.is_empty() {
        return 0;
    }
    let exe = exe_tokens.concat();
    // "game.exe" and "ShooterGame-Win64-Shipping.exe" tell us nothing — every
    // Unreal game ships one of the latter — so a confident guess would be
    // wrong most of the time. Checked whole as well as per-token, because the
    // camelCase split turns "ShooterGame" into ["shooter", "game"].
    if GENERIC.contains(&exe.as_str()) || exe_tokens.iter().all(|t| GENERIC.contains(&t.as_str())) {
        return 0;
    }
    let title_tokens = tokens(title);
    if title_tokens.is_empty() {
        return 0;
    }

    let mut candidates = vec![title_tokens.concat()];
    if let Some(variant) = digit_variant(&title_tokens) {
        candidates.push(variant);
    }

    let short = acronym(&title_tokens);
    let mut best = 0;

    for candidate in &candidates {
        let points = if exe == *candidate {
            100
        } else if short.len() >= 2 && exe == short {
            // "bg3.exe" for "Baldur's Gate III".
            92
        } else if (exe.len() >= 4 && candidate.starts_with(&exe))
            || (candidate.len() >= 4 && exe.starts_with(candidate.as_str()))
        {
            // One name begins the other: "tunic" for "Tunic", or an
            // executable that adds a suffix the token filter missed.
            85
        } else if (exe.len() >= 5 && candidate.contains(&exe))
            || (candidate.len() >= 5 && exe.contains(candidate.as_str()))
        {
            // "flightsimulator" inside "microsoftflightsimulator2024".
            78
        } else {
            // Nothing structural: fall back to how similar the strings are,
            // capped well below the structural matches above.
            similarity(&exe, candidate) * 70 / 100
        };
        best = best.max(points);
    }
    best
}

/// The best of several titles for this executable, with its score.
pub fn best_title<'a>(exe_name: &str, titles: impl IntoIterator<Item = &'a str>) -> Option<(&'a str, u32)> {
    titles
        .into_iter()
        .map(|title| (title, score(exe_name, title)))
        .filter(|(_, points)| *points > 0)
        .max_by_key(|(_, points)| *points)
}

/// The best of several executables for this title, with its score.
pub fn best_exe<'a>(title: &str, exe_names: impl IntoIterator<Item = &'a str>) -> Option<(&'a str, u32)> {
    exe_names
        .into_iter()
        .map(|exe| (exe, score(exe, title)))
        .filter(|(_, points)| *points > 0)
        .max_by_key(|(_, points)| *points)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Real titles from a real library, matched against the executable names
    // those games actually ship.
    #[test]
    fn matches_a_name_written_as_one_word() {
        assert!(score("vampiresurvivors.exe", "Vampire Survivors") >= 95);
        assert!(score("VampireSurvivors.exe", "Vampire Survivors") >= 95);
        assert!(score("SplitFiction.exe", "Split Fiction") >= 95);
    }

    #[test]
    fn matches_an_abbreviation() {
        // Roman numerals in the title, a digit in the executable.
        assert!(score("bg3.exe", "Baldur's Gate III") >= CONFIDENT);
        assert!(score("rdr2.exe", "Red Dead Redemption 2") >= CONFIDENT);
    }

    #[test]
    fn matches_a_partial_name() {
        assert!(score("FlightSimulator.exe", "Microsoft Flight Simulator 2024") >= CONFIDENT);
        assert!(score("HelloKittyIslandAdventure.exe", "Hello Kitty Island Adventure") >= 95);
    }

    #[test]
    fn sees_through_unreal_style_decoration() {
        assert!(score("Tunic-Win64-Shipping.exe", "Tunic") >= CONFIDENT);
        assert!(score("hades_x64.exe", "Hades") >= CONFIDENT);
    }

    #[test]
    fn refuses_to_guess_from_a_generic_name() {
        // Every Unreal game ships one of these; a confident guess would be
        // wrong most of the time.
        assert_eq!(score("ShooterGame-Win64-Shipping.exe", "Vampire Survivors"), 0);
        assert_eq!(score("game.exe", "Vampire Survivors"), 0);
    }

    #[test]
    fn does_not_match_unrelated_things() {
        assert!(score("brave.exe", "Vampire Survivors") < CONFIDENT);
        assert!(score("discord.exe", "Baldur's Gate III") < CONFIDENT);
        assert!(score("notepad.exe", "Red Dead Redemption 2") < CONFIDENT);
    }

    #[test]
    fn a_roman_numeral_that_is_really_a_letter_still_matches() {
        // "V Rising" is not "5 Rising"; the raw form has to stay a candidate.
        assert!(score("VRising.exe", "V Rising") >= 95);
    }

    #[test]
    fn picks_the_best_title_out_of_a_library() {
        let titles = vec![
            "Split Fiction",
            "Vampire Survivors",
            "Baldur's Gate III",
            "Red Dead Redemption 2",
        ];
        let (title, points) = best_title("vampiresurvivors.exe", titles.clone()).unwrap();
        assert_eq!(title, "Vampire Survivors");
        assert!(points >= CONFIDENT);

        let (title, _) = best_title("bg3.exe", titles.clone()).unwrap();
        assert_eq!(title, "Baldur's Gate III");

        let (title, _) = best_title("SplitFiction.exe", titles).unwrap();
        assert_eq!(title, "Split Fiction");
    }

    #[test]
    fn picks_the_best_executable_for_a_title() {
        let running = vec!["brave.exe", "discord.exe", "VampireSurvivors.exe", "steam.exe"];
        let (exe, points) = best_exe("Vampire Survivors", running).unwrap();
        assert_eq!(exe, "VampireSurvivors.exe");
        assert!(points >= CONFIDENT);
    }

    #[test]
    fn offers_nothing_when_nothing_is_close() {
        let running = vec!["brave.exe", "discord.exe"];
        let best = best_exe("Vampire Survivors", running);
        assert!(best.is_none_or(|(_, points)| points < CONFIDENT));
    }
}
