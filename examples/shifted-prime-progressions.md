# Verify a claim about shifted-prime progressions

Use this example to check whether a summary preserves the hypotheses and scope of a mathematical source. The source is *Quantitative Bounds for Sets Lacking Polynomial Progressions with Shifted Prime Difference* by Ben Krause, Hamed Mousavi, Terence Tao, and Joni Teräväinen. [arXiv:2608.19525v1](https://arxiv.org/abs/2608.19525v1)

| Claim to check | What the cited result supports |
| --- | --- |
| For fixed nonconstant integer polynomials of distinct degrees and zero constant term, a subset of `[N]` avoiding all the specified nondegenerate progressions with shift `p − 1` has size at most a constant times `N / (log N)^c` for some `c > 0` and sufficiently large `N`. | Theorem 1.2 (p. 2) supports the claim. The exponent depends on the fixed polynomial family and progression length. Nondegeneracy requires the offsets, including zero, to be pairwise distinct. |
| The same polylogarithmic density bound applies to every progression formed by taking distinct nonzero integer multiples of one fixed polynomial. | Theorems 1.2 and 1.3 (pp. 2–3) do not establish this extension. The multiples have the same degree. For a fixed nonzero polynomial with zero constant term, Theorem 1.3 gives bounds that depend on its derivative at zero and the progression length. |
| For the polynomials `y` and `y²`, choosing `p = 2` gives a nondegenerate progression. | The claim is contradicted by direct substitution. Both offsets are 1, so the last two terms coincide. |

For a finite witness with the same polynomials, take `A = {1, 3, 5}`, `x = 1`, and `p = 3`. The shift is 2 and the offsets are 2 and 4. The resulting points are distinct and all belong to `A`. This calculation verifies the witness. The asymptotic density claim is assessed against the cited theorem and its hypotheses.
