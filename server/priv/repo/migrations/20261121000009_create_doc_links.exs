defmodule NicheNotes.Repo.Migrations.CreateDocLinks do
  use Ecto.Migration

  # The links from docs.link are dropped rather than carried over, and so are the shares of the guests they let in.
  def change do
    create table(:doc_links, primary_key: false) do
      add :token, :text, primary_key: true
      add :doc_id, references(:docs, type: :binary_id, on_delete: :delete_all), null: false
      add :read_only, :boolean, null: false
      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:doc_links, [:doc_id])

    # A link's guests lose the note with it, but someone with an account who came by it keeps theirs.
    alter table(:doc_shares) do
      add :read_only, :boolean, null: false, default: false

      add :link,
          references(:doc_links, column: :token, type: :text, on_delete: :nilify_all)
    end

    execute "DELETE FROM doc_shares WHERE user_id IN (SELECT id FROM users WHERE sub LIKE 'guest:%')",
            ""

    drop unique_index(:docs, [:link])

    alter table(:docs) do
      remove :link, :text
    end
  end
end
