import { useCallback, useEffect, useRef, useState } from 'react';
import { api, money } from './api';
import './styles.css';

function Notice({ children, error = false }) {
  if (!children) return null;
  return <div className={`notice ${error ? 'notice-error' : 'notice-success'}`} role={error ? 'alert' : 'status'}>{children}</div>;
}

function AccountSidebar({ accounts, selectedId, onSelect, onCreated, loading, error, onRetry }) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(null);

  async function createAccount(event) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);
    if (!name.trim()) { setMessage({ error: true, text: 'Enter an account name.' }); return; }
    setPending(true);
    try {
      const { data } = await api('/accounts', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      onCreated(data);
      setName('');
      setMessage({ text: `Account “${data.name}” created.` });
    } catch (error) { setMessage({ error: true, text: error.message }); }
    finally { setPending(false); }
  }

  return <aside className="sidebar">
    <div className="section-heading"><h2>Accounts</h2><span className="count">{accounts.length}</span></div>
    <p className="muted sidebar-intro">Choose an account to view its ledger.</p>
    {loading && <p className="muted" role="status">Loading accounts…</p>}
    {error && <><Notice error>{error}</Notice><button className="button button-quiet" onClick={onRetry}>Retry loading accounts</button></>}
    {!loading && !error && accounts.length === 0 && <div className="account-empty">Your ledger starts here.<br /><span className="muted">Create your first account below.</span></div>}
    <nav className="account-list" aria-label="Select account">
      {accounts.map((account) => <button key={account.id} className={`account-option ${selectedId === account.id ? 'selected' : ''}`} aria-pressed={selectedId === account.id} onClick={() => onSelect(account.id)}>
        <span className="account-avatar" aria-hidden="true">{account.name.slice(0, 1).toUpperCase()}</span>
        <span className="account-option-text"><strong>{account.name}</strong><span>{money(account.balance)}</span></span>
        <span className="selection-dot" aria-hidden="true" />
      </button>)}
    </nav>
    <form className="create-form" onSubmit={createAccount}>
      <h3>Create account</h3>
      <label htmlFor="account-name">Account name</label>
      <input id="account-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Operations" required disabled={pending} autoComplete="off" />
      <button className="button button-secondary full-width" disabled={pending}>{pending ? 'Creating…' : '+ Create account'}</button>
      <Notice error={message?.error}>{message?.text}</Notice>
    </form>
  </aside>;
}

function TransactionForm({ accountId, onPosted }) {
  const [type, setType] = useState('credit');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [referenceId, setReferenceId] = useState('transaction');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);
    if (!/^(0|[1-9]\d*)\.\d{2}$/.test(amount) || BigInt(amount.replace('.', '')) <= 0n || BigInt(amount.replace('.', '')) > BigInt(Number.MAX_SAFE_INTEGER)) {
      setMessage({ error: true, text: 'Enter a positive amount with exactly two decimal places, up to 90071992547409.91.' });
      return;
    }
    if (!referenceId.trim()) { setMessage({ error: true, text: 'Enter a unique reference ID.' }); return; }
    setPending(true);
    try {
      const { data } = await api(`/accounts/${accountId}/transactions`, { method: 'POST', body: JSON.stringify({ type, amount, description: description.trim(), referenceId: referenceId.trim() }) });
      if (!mounted.current) return;
      onPosted(data);
      setAmount(''); setDescription(''); setReferenceId('transaction');
      setMessage({ text: `${type === 'credit' ? 'Credit' : 'Debit'} of ${money(data.amount)} posted successfully.` });
    } catch (error) {
      if (!mounted.current) return;
      setMessage({ error: true, text: error.message });
    } finally { if (mounted.current) setPending(false); }
  }

  return <section className="panel transaction-panel" aria-labelledby="new-transaction-title">
    <div className="panel-header"><div><h2 id="new-transaction-title">New transaction</h2><p className="muted">Record a credit or debit for this account.</p></div><span className="small-label">LEDGER ENTRY</span></div>
    <form onSubmit={submit}>
      <fieldset disabled={pending} className="transaction-fields">
        <legend className="sr-only">Transaction details</legend>
        <div className="type-field"><span className="field-label" id="type-label">Transaction type</span><div className="type-toggle" role="group" aria-labelledby="type-label">
          <button type="button" aria-pressed={type === 'credit'} className={type === 'credit' ? 'active credit-toggle' : ''} onClick={() => setType('credit')}><span aria-hidden="true">＋</span> Credit</button>
          <button type="button" aria-pressed={type === 'debit'} className={type === 'debit' ? 'active debit-toggle' : ''} onClick={() => setType('debit')}><span aria-hidden="true">−</span> Debit</button>
        </div></div>
        <div><label htmlFor="amount">Amount</label><input id="amount" type="text" inputMode="decimal" placeholder="0.00" maxLength={17} pattern="(0|[1-9][0-9]*)\.[0-9]{2}" title="Enter a positive amount with exactly two decimal places, for example 12.34" value={amount} onChange={(event) => setAmount(event.target.value)} required aria-describedby="amount-hint" /><span className="field-hint" id="amount-hint">Exactly two decimal places</span></div>
        <div><label htmlFor="reference">Reference ID</label><input id="reference" value={referenceId} onChange={(event) => setReferenceId(event.target.value)} placeholder="e.g. transaction-001" required autoComplete="off" /><span className="field-hint">Append a value, e.g. transaction-001; unique within this account</span></div>
        <div className="description-field"><label htmlFor="description">Description <span className="optional">(optional)</span></label><input id="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this transaction for?" /></div>
      </fieldset>
      <div className="form-footer"><p className="muted">Posted entries cannot be edited or deleted.</p><button className="button button-primary" disabled={pending}>{pending ? 'Posting…' : `Post ${type}`}</button></div>
      <Notice error={message?.error}>{message?.text}</Notice>
    </form>
  </section>;
}

function TransferForm({ accounts, accountId, onTransferred }) {
  const [sourceId, setSourceId] = useState(accountId);
  const [destinationId, setDestinationId] = useState('');
  const [amount, setAmount] = useState('');
  const [referenceId, setReferenceId] = useState('transfer');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);
    if (!sourceId || !destinationId || sourceId === destinationId) {
      setMessage({ error: true, text: 'Choose two different accounts.' }); return;
    }
    if (!accounts.some((account) => account.id === sourceId) || !accounts.some((account) => account.id === destinationId)) {
      setMessage({ error: true, text: 'Both source and destination accounts must exist. Refresh and select your accounts again.' }); return;
    }
    if (!/^(0|[1-9]\d*)\.\d{2}$/.test(amount) || BigInt(amount.replace('.', '')) <= 0n || BigInt(amount.replace('.', '')) > BigInt(Number.MAX_SAFE_INTEGER)) {
      setMessage({ error: true, text: 'Enter a positive amount with exactly two decimal places, up to 90071992547409.91.' }); return;
    }
    if (!referenceId.trim()) { setMessage({ error: true, text: 'Enter a unique reference ID.' }); return; }
    setPending(true);
    try {
      const { data } = await api('/transfers', { method: 'POST', body: JSON.stringify({
        source_account_id: sourceId, destination_account_id: destinationId,
        amount, reference_id: referenceId.trim(), description: description.trim(),
      }) });
      onTransferred(data);
      if (!mounted.current) return;
      setAmount(''); setReferenceId('transfer'); setDescription('');
      setMessage({ text: `Transfer of ${money(data.amount)} from “${data.source.name}” to “${data.destination.name}” completed.` });
    } catch (error) {
      if (mounted.current) setMessage({ error: true, text: error.message });
    } finally { if (mounted.current) setPending(false); }
  }

  return <section className="panel transaction-panel" aria-labelledby="transfer-title">
    <div className="panel-header"><div><h2 id="transfer-title">Money Transfer</h2><p className="muted">Transfer between two existing accounts. The source must have sufficient funds.</p></div></div>
    <form onSubmit={submit}>
      {accounts.length < 2 && <p className="muted transfer-hint">Create at least two accounts to make a transfer.</p>}
      <fieldset className="transaction-fields transfer-fields" disabled={pending || accounts.length < 2}>
        <legend className="sr-only">Transfer details</legend>
        <div><label htmlFor="transfer-from">From account</label><select id="transfer-from" value={sourceId} required onChange={(event) => { setSourceId(event.target.value); if (event.target.value === destinationId) setDestinationId(''); }}>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.id.slice(-6)} · {money(account.balance)}</option>)}
        </select></div>
        <div><label htmlFor="transfer-to">To account</label><select id="transfer-to" value={destinationId} required onChange={(event) => setDestinationId(event.target.value)}>
          <option value="">Choose destination account</option>
          {accounts.filter((account) => account.id !== sourceId).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.id.slice(-6)} · {money(account.balance)}</option>)}
        </select></div>
        <div><label htmlFor="transfer-amount">Amount</label><input id="transfer-amount" inputMode="decimal" placeholder="0.00" maxLength={17} value={amount} onChange={(event) => setAmount(event.target.value)} required /><span className="field-hint">Exactly two decimal places</span></div>
        <div><label htmlFor="transfer-reference">Reference ID</label><input id="transfer-reference" value={referenceId} onChange={(event) => setReferenceId(event.target.value)} placeholder="e.g. transfer-001" required autoComplete="off" /><span className="field-hint">Append a value, e.g. transfer-001; unused in both accounts. Reuse only when retrying this transfer</span></div>
        <div><label htmlFor="transfer-description">Description <span className="optional">(optional)</span></label><input id="transfer-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this transfer for?" /></div>
      </fieldset>
      <div className="form-footer"><p className="muted">Both balances and entries commit together. If any step fails, the entire transfer is rolled back.</p><button className="button button-primary" disabled={pending || accounts.length < 2}>{pending ? 'Transferring…' : 'Transfer money'}</button></div>
      <Notice error={message?.error}>{message?.text}</Notice>
    </form>
  </section>;
}

function TransactionHistory({ accountId, revision, page, setPage, filter, setFilter }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setResult(null);
    const query = new URLSearchParams({ page: String(page), limit: '10', ...(filter ? { type: filter } : {}) });
    api(`/accounts/${accountId}/transactions?${query}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setResult(data); })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accountId, revision, page, filter]);
  const pagination = result?.pagination;
  return <section className="panel history-panel" aria-labelledby="history-title" aria-busy={loading}>
    <div className="panel-header"><div><h2 id="history-title">Transaction history</h2><p className="muted">Latest entries first</p></div><div className="history-filter"><label htmlFor="history-type">Show</label><select aria-label="Filter transactions" id="history-type" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}><option value="">All transactions</option><option value="credit">Credits only</option><option value="debit">Debits only</option></select></div></div>
    {error && <div className="history-notice"><Notice error>{error}</Notice></div>}
    <div className="table-scroll"><table><caption className="sr-only">Transactions for the selected account, newest first</caption><thead><tr><th scope="col">Date & time</th><th scope="col">Description</th><th scope="col">Reference ID</th><th scope="col">Type</th><th scope="col" className="amount-cell">Amount</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="5" className="table-state" role="status">Loading transactions…</td></tr> : error ? <tr><td colSpan="5" className="table-state">History could not be loaded. Use Refresh to try again.</td></tr> : !result?.data.length ? <tr><td colSpan="5" className="table-state"><strong>{filter ? `No ${filter} transactions yet` : 'No transactions yet'}</strong><span>{filter ? 'Choose another filter or post a new entry.' : 'Your first posting will appear here.'}</span></td></tr> : result.data.map((transaction) => <tr key={transaction.id}><td className="date-cell"><time dateTime={transaction.createdAt}>{new Date(transaction.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></td><td className="description-cell">{transaction.description || <span className="muted">No description</span>}</td><td className="reference-cell">{transaction.referenceId}</td><td><span className={`badge badge-${transaction.type}`}>{transaction.type}</span></td><td className={`amount-cell ${transaction.type === 'credit' ? 'credit-amount' : ''}`}>{transaction.type === 'credit' ? '+' : '−'}{money(transaction.amount)}</td></tr>)}
    </tbody></table></div>
    <div className="pagination"><span className="muted">{pagination ? `${pagination.total} ${pagination.total === 1 ? 'transaction' : 'transactions'}${filter ? ` · ${filter}s` : ''}` : '10 entries per page'}</span><div><button className="button button-quiet" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span className="page-label">Page {page}{pagination?.totalPages > 0 ? ` of ${pagination.totalPages}` : ''}</span><button className="button button-quiet" disabled={loading || !pagination || page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
  </section>;
}

function AccountWorkspace({ account, accounts, onBalance, onTransferred, transferRevision }) {
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState('');
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setBalanceLoading(true); setBalanceError('');
    api(`/accounts/${account.id}/balance`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setBalance(data.balance); onBalance(account.id, data.balance); } })
      .catch((error) => { if (!controller.signal.aborted) { setBalance(null); setBalanceError(error.message); } })
      .finally(() => { if (!controller.signal.aborted) setBalanceLoading(false); });
    return () => controller.abort();
  }, [account.id, revision, transferRevision, onBalance]);
  useEffect(() => { setPage(1); }, [transferRevision]);
  function posted(transaction) {
    setBalance(transaction.balance);
    onBalance(account.id, transaction.balance);
    setPage(1);
    setRevision((value) => value + 1);
  }
  return <main className="workspace">
    <div className="workspace-heading"><div><p className="eyebrow">ACCOUNT OVERVIEW</p><h1>{account.name}</h1></div><button className="button button-secondary refresh-button" onClick={() => setRevision((value) => value + 1)}><span aria-hidden="true">↻</span> Refresh</button></div>
    <section className="balance-card" aria-label="Account balance"><div><p className="balance-label">Available balance</p><div className="balance-value" aria-live="polite">{balanceLoading ? <span className="balance-loading">Updating…</span> : balance === null ? 'Unavailable' : money(balance)}</div><p className="balance-caption">{balanceLoading ? 'Fetching the latest balance' : balanceError ? 'Balance could not be refreshed' : 'Current ledger balance'}</p></div><div className="account-identity"><span>ACCOUNT ID</span><code>{account.id}</code></div></section>
    <Notice error>{balanceError}</Notice>
    <div className="entry-columns">
      <TransactionForm accountId={account.id} onPosted={posted} />
      <TransferForm accounts={accounts} accountId={account.id} onTransferred={onTransferred} />
    </div>
    <TransactionHistory accountId={account.id} revision={`${revision}-${transferRevision}`} page={page} setPage={setPage} filter={filter} setFilter={setFilter} />
    <p className="workspace-footnote">Transaction Ledger API · Every entry accounted for.</p>
  </main>;
}

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [transferRevision, setTransferRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api('/accounts', { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      setAccounts((current) => [...data, ...current.filter((account) => !data.some((item) => item.id === account.id))]);
      setSelectedId((current) => current || data[0]?.id || '');
    }).catch((error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  const selected = accounts.find((account) => account.id === selectedId);
  const updateBalance = useCallback((id, balance) => {
    setAccounts((current) => current.map((account) => account.id === id ? { ...account, balance } : account));
  }, []);
  const transferred = useCallback((data) => {
    setAccounts((current) => current.map((account) => {
      const updated = [data.source, data.destination].find((item) => item.id === account.id);
      return updated ? { ...account, balance: updated.balance } : account;
    }));
    setTransferRevision((value) => value + 1);
  }, []);
  return <div className="app-shell"><header className="topbar"><a className="brand" href="/" aria-label="Transaction Ledger API home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>Transaction Ledger <span>API</span></a><span className="topbar-label">ACCOUNT DASHBOARD</span></header><div className="dashboard-layout"><AccountSidebar accounts={accounts} selectedId={selectedId} onSelect={setSelectedId} loading={loading} error={error} onRetry={() => setReload((value) => value + 1)} onCreated={(account) => { setAccounts((current) => [account, ...current.filter((item) => item.id !== account.id)]); setSelectedId(account.id); }} />
    {selected ? <AccountWorkspace key={selected.id} account={selected} accounts={accounts} onBalance={updateBalance} onTransferred={transferred} transferRevision={transferRevision} /> : <main className="workspace welcome"><div className="welcome-icon" aria-hidden="true">＋</div><p className="eyebrow">WELCOME TO TRANSACTION LEDGER API</p><h1>A clear view of every entry.</h1><p className="muted">{loading ? 'Loading your accounts…' : error ? 'Connect to the API to load your accounts, or try creating one.' : 'Create an account to start recording transactions and tracking its balance.'}</p></main>}
  </div></div>;
}
