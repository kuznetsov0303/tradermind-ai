from app.data.security_master import classify_security

def test_common_stock_allowed():
    d=classify_security({
        "symbol":"AAPL","companyName":"Apple Inc.",
        "type":"stock","exchangeShortName":"NASDAQ",
        "isEtf":False,"isFund":False,"isActivelyTrading":True,
    })
    assert d.allowed and d.classification=="COMMON_STOCK"

def test_etf_blocked():
    d=classify_security({
        "symbol":"QQQ","companyName":"Invesco QQQ Trust ETF",
        "type":"etf","exchangeShortName":"NASDAQ",
        "isEtf":True,"isActivelyTrading":True,
    })
    assert not d.allowed and "ETF" in d.reasons

def test_unknown_fails_closed():
    d=classify_security({
        "symbol":"ABCD","companyName":"Example Corp",
        "exchangeShortName":"NASDAQ","isActivelyTrading":True,
    })
    assert not d.allowed and d.classification=="UNKNOWN_FAIL_CLOSED"

def test_warrant_blocked():
    d=classify_security({
        "symbol":"ABCW","companyName":"Example Warrant",
        "type":"stock","exchangeShortName":"NASDAQ",
        "isActivelyTrading":True,
    })
    assert not d.allowed
