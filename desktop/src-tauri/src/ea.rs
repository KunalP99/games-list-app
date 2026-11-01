//! Working out which game an executable belongs to, for EA App.
//!
//! The first version of this read `HKLM\Software\Wow6432Node\Origin Games`,
//! on real community documentation that an `Install Dir` value appears there
//! once a title is installed. Verified live against this machine: it does
//! not — not for Bejeweled 3, installed and running at the time — meaning
//! that registry key is a licensing/ownership list left over from the old
//! Origin client, not a live record of what EA App's modern "EA Desktop"
//! client has actually put on disk anywhere.
//!
//! What EA App writes instead sits right next to the game: every install
//! drops `<install folder>\__Installer\installerdata.xml`, UTF-16 with a BOM,
//! carrying the exact title and the same contentID the registry uses. No
//! central list to go read first — given a running exe, this walks up from
//! it looking for that file, the same shape Steam's own matching uses
//! (anchor on a known file, not a trusted central index).

use std::path::Path;

/// How many directories to walk up from an exe before giving up. Generous —
/// Bejeweled 3's own layout is `<game>\__Installer\...` one level up from
/// where the exe itself can sit nested several folders deep (`<game>\<locale
/// build>\Game.exe`) — but bounded, so a path with no EA install anywhere
/// above it does not walk all the way to a drive root on every single poll.
const MAX_ANCESTORS: usize = 6;

/// Decode installerdata.xml's UTF-16 (with or without a byte-order mark) and
/// pull out the first `<title>`.
///
/// Only the title is read. `contentID` is also in this file and matches the
/// registry's licensing-key naming, but nothing here needs it — the title is
/// what gets searched against IGDB, the same as every other launcher.
pub fn parse_title(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 2 {
        return None;
    }
    // BOM tells us the byte order; default to little-endian (what EA's own
    // installer writes) if one is somehow absent.
    let units: Vec<u16> = if bytes[0] == 0xFF && bytes[1] == 0xFE {
        bytes[2..].as_chunks::<2>().0.iter().map(|c| u16::from_le_bytes(*c)).collect()
    } else if bytes[0] == 0xFE && bytes[1] == 0xFF {
        bytes[2..].as_chunks::<2>().0.iter().map(|c| u16::from_be_bytes(*c)).collect()
    } else {
        bytes.as_chunks::<2>().0.iter().map(|c| u16::from_le_bytes(*c)).collect()
    };

    let text: String = char::decode_utf16(units).filter_map(|r| r.ok()).collect();
    let start = text.find("<title>")? + "<title>".len();
    let end = text[start..].find("</title>")? + start;
    let title = text[start..end].trim();
    if title.is_empty() { None } else { Some(title.to_string()) }
}

/// Look for `__Installer\installerdata.xml` at or above an executable's own
/// directory, and return its parsed title.
///
/// `read` takes the manifest path it found and returns the file's raw bytes,
/// so the walk itself can be tested without real files on disk.
pub fn find_title_for_exe<F>(exe_path: &str, mut read: F) -> Option<String>
where
    F: FnMut(&Path) -> Option<Vec<u8>>,
{
    let mut dir = Path::new(exe_path).parent()?.to_path_buf();
    for _ in 0..MAX_ANCESTORS {
        let candidate = dir.join("__Installer").join("installerdata.xml");
        if let Some(bytes) = read(&candidate) {
            return parse_title(&bytes);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

/// The display name for a running executable, reading the real filesystem.
pub fn display_name_for_exe(exe_path: &str) -> Option<String> {
    find_title_for_exe(exe_path, |p| std::fs::read(p).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// UTF-16LE-with-BOM bytes for a minimal installerdata.xml, matching
    /// what EA's own installer actually writes (confirmed against a real
    /// file on this machine).
    fn utf16_bom(s: &str) -> Vec<u8> {
        let mut out = vec![0xFF, 0xFE];
        for u in s.encode_utf16() {
            out.extend_from_slice(&u.to_le_bytes());
        }
        out
    }

    #[test]
    fn parses_the_title_from_a_real_shaped_file() {
        // Trimmed from this machine's actual installerdata.xml for Bejeweled 3.
        let xml = "<?xml version=\"1.0\" encoding=\"utf-16\"?>\n\
                   <game gameVersion=\"1.1.13.4753\" manifestVersion=\"2.1\">\n\
                   <contentIDs><contentID>71715</contentID></contentIDs>\n\
                   <metadata><localeInfo locale=\"en_US\">\n\
                   <title>Bejeweled\u{ae} 3</title>\n\
                   </localeInfo></metadata></game>";
        assert_eq!(parse_title(&utf16_bom(xml)).as_deref(), Some("Bejeweled\u{ae} 3"));
    }

    #[test]
    fn works_without_a_bom_too() {
        let mut bytes = Vec::new();
        for u in "<title>Titanfall 2</title>".encode_utf16() {
            bytes.extend_from_slice(&u.to_le_bytes());
        }
        assert_eq!(parse_title(&bytes).as_deref(), Some("Titanfall 2"));
    }

    #[test]
    fn is_none_for_malformed_or_empty_input() {
        assert_eq!(parse_title(&[]), None);
        assert_eq!(parse_title(&utf16_bom("<game>no title here</game>")), None);
        assert_eq!(parse_title(&utf16_bom("<title></title>")), None);
        assert_eq!(parse_title(&utf16_bom("<title>   </title>")), None);
    }

    #[test]
    fn finds_the_manifest_one_level_above_a_locale_subfolder() {
        // The real shape: Bejeweled3.exe sits in "Bejeweled 3 EN", a sibling
        // of __Installer, both one level under the actual install root.
        let xml = utf16_bom("<title>Bejeweled\u{ae} 3</title>");
        let found = find_title_for_exe(r"C:\Program Files\EA Games\Bejeweled 3\Bejeweled 3 EN\Bejeweled3.exe", |p| {
            if p == Path::new(r"C:\Program Files\EA Games\Bejeweled 3\Bejeweled 3 EN\__Installer\installerdata.xml") {
                None // not here — one level too shallow
            } else if p == Path::new(r"C:\Program Files\EA Games\Bejeweled 3\__Installer\installerdata.xml") {
                Some(xml.clone())
            } else {
                None
            }
        });
        assert_eq!(found.as_deref(), Some("Bejeweled\u{ae} 3"));
    }

    #[test]
    fn finds_the_manifest_right_beside_the_exe_too() {
        let xml = utf16_bom("<title>Titanfall 2</title>");
        let found = find_title_for_exe(r"C:\Program Files\EA Games\Titanfall2\Titanfall2.exe", |p| {
            if p == Path::new(r"C:\Program Files\EA Games\Titanfall2\__Installer\installerdata.xml") {
                Some(xml.clone())
            } else {
                None
            }
        });
        assert_eq!(found.as_deref(), Some("Titanfall 2"));
    }

    #[test]
    fn gives_up_after_the_bound_rather_than_walking_to_the_drive_root() {
        let mut calls = 0;
        let found = find_title_for_exe(r"D:\Games\NotEA\SomeTool.exe", |_| {
            calls += 1;
            None
        });
        assert_eq!(found, None);
        assert!(calls <= MAX_ANCESTORS, "walked {calls} levels, bound is {MAX_ANCESTORS}");
    }
}
