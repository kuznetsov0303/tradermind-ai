from app.data.security_master import classify_security

CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

def profile(symbol,**overrides):
    row={
        "symbol":symbol,
        "companyName":f"{symbol} Corporation",
        "exchangeShortName":"NASDAQ",
        "isEtf":False,
        "isFund":False,
        "isActivelyTrading":True,
    }
    row.update(overrides)
    return row

def test_core25_reference_flags_allowed():
    blocked=[]
    for symbol in CORE25:
        decision=classify_security(profile(symbol))
        if not decision.allowed:
            blocked.append((symbol,decision.classification,decision.reasons))
    assert blocked==[]

def test_etf_blocked():
    decision=classify_security(profile(
        "QQQ",
        companyName="Invesco QQQ Trust ETF",
        type="etf",
        isEtf=True,
    ))
    assert not decision.allowed

def test_warrant_blocked():
    decision=classify_security(profile(
        "ABC.W",
        companyName="Example Holdings Warrant",
    ))
    assert not decision.allowed

def test_legitimate_single_letter_endings_allowed():
    for symbol in ("NOW","MU","UBER"):
        assert classify_security(profile(symbol)).allowed

def test_unknown_fails_closed():
    decision=classify_security({
        "symbol":"ABCD",
        "companyName":"Example Corporation",
        "exchangeShortName":"NASDAQ",
    })
    assert not decision.allowed
    assert decision.classification=="UNKNOWN_FAIL_CLOSED"
