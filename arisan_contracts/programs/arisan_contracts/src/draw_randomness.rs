use anchor_lang::prelude::*;

/// SlotHashes keeps the most recent 512 slots.
pub const MAX_SLOT_HASH_AGE: u64 = 512;

/// Read one slot's hash from the SlotHashes sysvar.
/// Entries are newest-first: `(slot: u64, hash: [u8; 32])` after a u64 length.
pub fn read_slot_hash(data: &[u8], target_slot: u64) -> Option<[u8; 32]> {
    if data.len() < 8 {
        return None;
    }
    let declared = u64::from_le_bytes(data[0..8].try_into().ok()?) as usize;
    let entry_len = 8 + 32;
    let available = data.len().saturating_sub(8) / entry_len;
    let count = declared.min(available);
    for i in 0..count {
        let off = 8 + i * entry_len;
        let slot = u64::from_le_bytes(data[off..off + 8].try_into().ok()?);
        if slot == target_slot {
            let mut hash = [0u8; 32];
            hash.copy_from_slice(&data[off + 8..off + 40]);
            return Some(hash);
        }
        if slot < target_slot {
            return None;
        }
    }
    None
}

/// Map a slot hash onto the eligible set.
///
/// Wallets are sorted by raw pubkey bytes before the modulo, so the order of
/// accounts in the transaction cannot change the winner.
pub fn select_winner(hash: &[u8; 32], eligible: &mut [Pubkey]) -> Option<Pubkey> {
    if eligible.is_empty() {
        return None;
    }
    eligible.sort();
    let n = u64::from_le_bytes(hash[0..8].try_into().ok()?);
    let idx = (n % eligible.len() as u64) as usize;
    Some(eligible[idx])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_order_does_not_change_the_winner() {
        let a = Pubkey::new_unique();
        let b = Pubkey::new_unique();
        let c = Pubkey::new_unique();
        let hash = [7u8; 32];

        let mut forward = [a, b, c];
        let mut reverse = [c, b, a];
        let mut middle = [b, c, a];

        let w1 = select_winner(&hash, &mut forward).unwrap();
        let w2 = select_winner(&hash, &mut reverse).unwrap();
        let w3 = select_winner(&hash, &mut middle).unwrap();
        assert_eq!(w1, w2);
        assert_eq!(w2, w3);
    }

    #[test]
    fn different_hashes_can_select_different_members() {
        let low = Pubkey::new_from_array([0u8; 32]);
        let high = Pubkey::new_from_array([255u8; 32]);
        let hash_low = [0u8; 32];
        let mut hash_high = [0u8; 32];
        hash_high[0] = 1;

        let mut set_a = [low, high];
        let mut set_b = [low, high];
        let w_low = select_winner(&hash_low, &mut set_a).unwrap();
        let w_high = select_winner(&hash_high, &mut set_b).unwrap();
        assert_eq!(w_low, low);
        assert_eq!(w_high, high);
    }
}
