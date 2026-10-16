CREATE UNIQUE INDEX IF NOT EXISTS notifications_source_recipient_uidx
  ON notifications (user_id, type, (payload_json->>'sourceId'))
  WHERE type IN ('mention', 'reply');
