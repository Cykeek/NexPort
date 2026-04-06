use russh_keys::decode_secret_key;

fn main() {
    let key_data = r#"-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZWQyNTUxOQAAACAm/o77GTFdpMabRSP3cLp0j/d6zlLq5eIlO728ehmvSAAAAJBaKyaMWismjAAAAAtzc2gtZWQyNTUxOQAAACAm/o77GTFdpMabRSP3cLp0j/d6zlLq5eIlO728ehmvSAAAAEDofWZDmmcMynnAFjXjzKADIxJ3a3UD+DZQ2tScoQnghCb+jvsZMV2kxptFI/dwunSP93rOUurl4iU7vbx6Ga9IAAAAAAECAwQFBgcICQoLDA0=
-----END OPENSSH PRIVATE KEY-----"#;

    match decode_secret_key(key_data, None) {
        Ok(key) => println!("Success! Key type: {:?}", key.algorithm()),
        Err(e) => println!("Error: {}", e),
    }
}
