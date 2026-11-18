package httpapi

import (
	"net/netip"
	"testing"
)

func TestIPCliente(t *testing.T) {
	confiaveis := []netip.Prefix{
		netip.MustParsePrefix("127.0.0.1/32"), netip.MustParsePrefix("::1/128"), netip.MustParsePrefix("10.42.0.0/16"),
	}
	casos := []struct {
		nome, par string
		xff       []string
		esperado  string
	}{
		{"sem proxy, sem cabeçalho", "203.0.113.9:5000", nil, "203.0.113.9"},
		{"cabeçalho forjado por par não confiável é ignorado", "203.0.113.9:5000", []string{"1.2.3.4"}, "203.0.113.9"},
		{"proxy confiável repassa o cliente", "10.42.0.7:4000", []string{"198.51.100.5"}, "198.51.100.5"},
		{"cliente forja a esquerda; vale o mais à direita não confiável", "10.42.0.7:4000", []string{"1.2.3.4, 198.51.100.5"}, "198.51.100.5"},
		{"proxies confiáveis à direita são pulados", "10.42.0.7:4000", []string{"198.51.100.5, 10.42.1.1, 127.0.0.1"}, "198.51.100.5"},
		{"vários cabeçalhos contam como um só", "10.42.0.7:4000", []string{"1.2.3.4", "198.51.100.5, 10.42.1.1"}, "198.51.100.5"},
		{"proxy confiável sem cabeçalho", "10.42.0.7:4000", nil, "10.42.0.7"},
		{"só proxies confiáveis no cabeçalho", "10.42.0.7:4000", []string{"10.42.1.1"}, "10.42.0.7"},
		{"lixo à direita invalida o cabeçalho", "10.42.0.7:4000", []string{"198.51.100.5, <script>"}, "10.42.0.7"},
		{"IPv6 local confiável", "[::1]:4000", []string{"2001:db8::1"}, "2001:db8::1"},
		{"IPv4 mapeado em IPv6 é normalizado", "[::ffff:10.42.0.7]:4000", []string{"::ffff:198.51.100.5"}, "198.51.100.5"},
		{"IPv6 não confiável", "[2001:db8::9]:4000", []string{"1.2.3.4"}, "2001:db8::9"},
	}
	for _, c := range casos {
		if obtido := IPCliente(c.par, c.xff, confiaveis); obtido != c.esperado {
			t.Errorf("%s: esperado %s, obtido %s", c.nome, c.esperado, obtido)
		}
	}
}
