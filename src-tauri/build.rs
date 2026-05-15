fn main() {
  // Embed the git commit hash at compile time for update detection.
  // CI sets NEXPORT_BUILD_COMMIT (full SHA); locally we fall back to `git rev-parse`.
  // We always truncate to 7 chars to match the short hash in latest.json.
  let commit = std::env::var("NEXPORT_BUILD_COMMIT").unwrap_or_else(|_| {
    std::process::Command::new("git")
      .args(["rev-parse", "HEAD"])
      .output()
      .ok()
      .and_then(|o| String::from_utf8(o.stdout).ok())
      .map(|s| s.trim().to_string())
      .unwrap_or_else(|| "unknown".to_string())
  });

  // Truncate to 7 chars (matches the short hash used in dev latest.json)
  let short_commit = if commit.len() > 7 { &commit[..7] } else { &commit };

  println!("cargo:rustc-env=NEXPORT_BUILD_COMMIT={}", short_commit);
  // Re-run if the env var changes (CI) or if HEAD changes (local dev)
  println!("cargo:rerun-if-env-changed=NEXPORT_BUILD_COMMIT");
  println!("cargo:rerun-if-changed=../.git/HEAD");

  tauri_build::build()
}
