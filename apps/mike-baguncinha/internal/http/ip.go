package httpapi

import (
	"net/netip"
	"strings"
)

// IPCliente aplica a regra do contrato: o X-Forwarded-For só vale quando o par direto da
// conexão é um proxy confiável; nesse caso, usa o IP mais à direita que não seja proxy
// confiável. Em qualquer outro caso, devolve o par direto e ignora o cabeçalho.
func IPCliente(remoteAddr string, forwardedFor []string, confiaveis []netip.Prefix) string {
	par, ok := lerIP(remoteAddr)
	if !ok {
		return remoteAddr
	}
	if !confiavel(par, confiaveis) {
		return par.String()
	}
	// Vários cabeçalhos X-Forwarded-For equivalem a um só, concatenado na ordem.
	itens := strings.Split(strings.Join(forwardedFor, ","), ",")
	for i := len(itens) - 1; i >= 0; i-- {
		ip, err := netip.ParseAddr(strings.TrimSpace(itens[i]))
		if err != nil {
			break // lixo no cabeçalho: não dá para confiar no que vem antes
		}
		if ip = ip.Unmap(); !confiavel(ip, confiaveis) {
			return ip.String()
		}
	}
	return par.String()
}

func lerIP(remoteAddr string) (netip.Addr, bool) {
	if ap, err := netip.ParseAddrPort(remoteAddr); err == nil {
		return ap.Addr().Unmap(), true
	}
	ip, err := netip.ParseAddr(remoteAddr)
	return ip.Unmap(), err == nil
}

func confiavel(ip netip.Addr, confiaveis []netip.Prefix) bool {
	for _, p := range confiaveis {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}
